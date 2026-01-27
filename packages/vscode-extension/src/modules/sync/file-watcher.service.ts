/**
 * File Watcher Service
 * Watches for source file saves and triggers automatic endpoint sync
 */

import * as vscode from "vscode";
import { detectAndParseRoutes, hasAnyProjectType } from "@watchapi/parsers";
import { CollectionsService, CollectionsTreeProvider } from "@/modules/collections";
import { EndpointsService } from "@/modules/endpoints";
import { logger } from "@/shared/logger";
import { FILE_WATCHER_CONFIG } from "@/shared/constants";
import { humanizeRouteName } from "@/modules/endpoints/endpoints.editor";
import type { ParsedRoute } from "./sync.types";
import type { Collection } from "@/modules/collections/collections.types";
import type { ApiEndpoint } from "@/modules/endpoints/endpoints.types";

export class FileWatcherService implements vscode.Disposable {
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingFiles = new Set<string>();
    private isSyncing = false;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private collectionsService: CollectionsService,
        private endpointsService: EndpointsService,
        private treeProvider: CollectionsTreeProvider,
        context: vscode.ExtensionContext,
    ) {
        // Register save listener
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((doc) =>
                this.handleSave(doc),
            ),
        );

        context.subscriptions.push(this);
        logger.info("FileWatcherService initialized");

        // Run initial full sync on activation
        this.runFullSync();
    }

    /**
     * Run a full sync of all routes (used on activation)
     */
    async runFullSync(): Promise<void> {
        if (this.isSyncing) {
            return;
        }

        this.isSyncing = true;

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            logger.info("Running full sync on activation...");

            const parserLogger = logger.createParserLogger();
            const result = await detectAndParseRoutes(workspaceRoot, {
                logger: parserLogger,
            });

            if (!hasAnyProjectType(result.detected)) {
                logger.info("No supported project types detected");
                return;
            }

            if (result.routes.length === 0) {
                logger.info("No routes found");
                return;
            }

            logger.info(`Found ${result.routes.length} routes, syncing...`);

            // Apply domain prefix to routes
            const routesWithDomain = this.applyDomainPrefix(result.routes);
            const routesWithNames = routesWithDomain.map((r) => ({
                ...r,
                name: humanizeRouteName(r),
            }));

            // Group routes by prefix and merge
            const groups = this.groupRoutesByPrefix(routesWithNames);
            await this.mergeRoutes(groups, workspaceRoot);

            this.treeProvider.refresh();
            logger.info("Full sync complete");
        } catch (error) {
            logger.error("Full sync failed", error);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Handle document save event
     */
    private handleSave(doc: vscode.TextDocument): void {
        if (!this.isEnabled() || !this.isRelevantFile(doc.fileName)) {
            return;
        }

        logger.debug(`File saved: ${doc.fileName}`);
        this.pendingFiles.add(doc.fileName);
        this.scheduleSync();
    }

    /**
     * Schedule a debounced sync
     */
    private scheduleSync(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(
            () => this.executeSync(),
            FILE_WATCHER_CONFIG.DEBOUNCE_MS,
        );
    }

    /**
     * Execute the sync operation
     */
    private async executeSync(): Promise<void> {
        if (this.isSyncing || this.pendingFiles.size === 0) {
            return;
        }

        this.isSyncing = true;
        const changedFiles = new Set(this.pendingFiles);
        this.pendingFiles.clear();

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Full scan then filter by changed files
            const parserLogger = logger.createParserLogger();
            const result = await detectAndParseRoutes(workspaceRoot, {
                logger: parserLogger,
            });

            if (!hasAnyProjectType(result.detected)) {
                return;
            }

            // Filter routes to only those from changed files
            const affectedRoutes = result.routes.filter((r) =>
                changedFiles.has(r.filePath),
            );

            if (affectedRoutes.length === 0) {
                logger.debug("No affected routes found in changed files");
                return;
            }

            logger.info(
                `Auto-syncing ${affectedRoutes.length} routes from ${changedFiles.size} file(s)`,
            );
            logger.debug(
                `Changed files: ${Array.from(changedFiles).join(", ")}`,
            );

            // Apply domain prefix to routes
            const routesWithDomain = this.applyDomainPrefix(affectedRoutes);
            const routesWithNames = routesWithDomain.map((r) => ({
                ...r,
                name: humanizeRouteName(r),
            }));

            // Group routes by prefix and merge (pass changedFiles for delete detection)
            const groups = this.groupRoutesByPrefix(routesWithNames);
            await this.mergeRoutes(groups, workspaceRoot, changedFiles);

            this.treeProvider.refresh();
            logger.info("Auto-sync complete");
        } catch (error) {
            logger.error("Auto-sync failed", error);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Merge routes into collections
     */
    private async mergeRoutes(
        groups: Map<string, ParsedRoute[]>,
        workspaceRoot: string,
        changedFiles?: Set<string>,
    ): Promise<void> {
        const existingCollections = await this.collectionsService.getAll();

        const stats = { created: 0, updated: 0, deleted: 0 };

        for (const [groupName, routes] of groups) {
            const collection = await this.findOrCreateCollection(
                existingCollections,
                groupName,
            );

            const existingEndpoints =
                await this.endpointsService.getByCollectionId(collection.id);

            // Build and execute merge plan
            const plan = this.buildMergePlan(
                routes,
                existingEndpoints,
                workspaceRoot,
                changedFiles,
            );

            await this.executeMergePlan(plan, collection.id, stats);
        }

        if (stats.created > 0 || stats.updated > 0 || stats.deleted > 0) {
            logger.info(
                `Auto-sync: ${stats.created} created, ${stats.updated} updated, ${stats.deleted} deleted`,
            );
        }
    }

    /**
     * Build a merge plan classifying routes into CREATE/UPDATE/DELETE buckets
     */
    private buildMergePlan(
        sourceRoutes: ParsedRoute[],
        existingEndpoints: ApiEndpoint[],
        workspaceRoot: string,
        changedFiles?: Set<string>,
    ) {
        const existingByExternalId = new Map(
            existingEndpoints
                .filter((e) => e.externalId)
                .map((e) => [e.externalId!, e]),
        );

        const toCreate: Array<{ route: ParsedRoute; externalId: string }> = [];
        const toUpdate: Array<{ route: ParsedRoute; existing: ApiEndpoint }> =
            [];
        const toDelete: ApiEndpoint[] = [];

        // Build set of externalIds from source routes
        const sourceExternalIds = new Set<string>();

        for (const route of sourceRoutes) {
            const externalId = this.endpointsService.generateExternalId(
                route,
                workspaceRoot,
            );
            sourceExternalIds.add(externalId);

            const match = existingByExternalId.get(externalId);
            if (match) {
                toUpdate.push({ route, existing: match });
            } else {
                toCreate.push({ route, externalId });
            }
        }

        // Find endpoints to delete (exist in DB but not in source)
        // Only delete endpoints that have externalId (were created by sync)
        for (const endpoint of existingEndpoints) {
            if (!endpoint.externalId) continue;

            // For incremental sync: only delete if file was changed
            if (changedFiles) {
                // externalId format: /path/to/file.ts#METHOD#/route or /path/to/file.ts#handlerName
                const hashIndex = endpoint.externalId.indexOf("#");
                const endpointFile =
                    hashIndex > 0
                        ? endpoint.externalId.slice(0, hashIndex)
                        : null;
                if (!endpointFile) continue;

                // Check if this endpoint's file was in the changed files
                const wasFileChanged = Array.from(changedFiles).some((f) =>
                    f.endsWith(endpointFile),
                );
                if (!wasFileChanged) continue;
            }

            // If endpoint's externalId is not in source routes, mark for deletion
            if (!sourceExternalIds.has(endpoint.externalId)) {
                toDelete.push(endpoint);
                logger.debug(
                    `Marking for deletion: ${endpoint.name} (externalId: ${endpoint.externalId})`,
                );
            }
        }

        return { toCreate, toUpdate, toDelete };
    }

    /**
     * Execute the merge plan
     */
    private async executeMergePlan(
        plan: ReturnType<typeof this.buildMergePlan>,
        collectionId: string,
        stats: { created: number; updated: number; deleted: number },
    ): Promise<void> {
        // Execute deletes first
        for (const endpoint of plan.toDelete) {
            await this.endpointsService.delete(endpoint.id);
            stats.deleted++;
            logger.debug(`Deleted endpoint: ${endpoint.name} (${endpoint.id})`);
        }

        // Execute updates (only update code-owned schema fields)
        for (const { route, existing } of plan.toUpdate) {
            const updateFields = {
                pathTemplate: route.path,
                method: route.method,
                name: route.name,
                bodySchema: route.body,
                headersSchema: route.headers,
                querySchema: route.query,
            };
            await this.endpointsService.update(existing.id, updateFields);
            stats.updated++;
        }

        // Execute creates
        for (const { route, externalId } of plan.toCreate) {
            await this.endpointsService.create({
                externalId,
                name: route.name,
                pathTemplate: route.path,
                requestPath: route.path,
                method: route.method,
                bodySchema: route.body,
                headersSchema: route.headers,
                querySchema: route.query,
                collectionId,
                bodyOverrides: undefined,
                headersOverrides: undefined,
            });
            stats.created++;
        }
    }

    /**
     * Find or create a collection by name
     */
    private async findOrCreateCollection(
        existingCollections: Collection[],
        groupName: string,
    ): Promise<Collection> {
        const existing = existingCollections.find((c) => c.name === groupName);
        if (existing) {
            return existing;
        }

        return await this.collectionsService.create({
            name: groupName,
            description: `Auto-generated from ${groupName} routes`,
        });
    }

    /**
     * Apply {{baseUrl}} prefix to routes
     */
    private applyDomainPrefix(routes: ParsedRoute[]): ParsedRoute[] {
        return routes.map((route) => ({
            ...route,
            path: `{{baseUrl}}${route.path}`,
        }));
    }

    /**
     * Group routes by prefix for collection names
     */
    private groupRoutesByPrefix(
        routes: ParsedRoute[],
    ): Map<string, ParsedRoute[]> {
        const groups = new Map<string, ParsedRoute[]>();

        for (const route of routes) {
            const prefix = this.extractRoutePrefix(route.path);
            const existing = groups.get(prefix) || [];
            existing.push(route);
            groups.set(prefix, existing);
        }

        return groups;
    }

    /**
     * Extract route prefix for collection naming
     */
    private extractRoutePrefix(path: string): string {
        const normalizedPath = path.replace("{{baseUrl}}", "");

        if (normalizedPath.startsWith("/api/trpc/")) {
            const trpcPath = normalizedPath.slice("/api/trpc/".length);
            const [router] = trpcPath.split(".");
            return this.capitalizeDomain(router || "default");
        }

        const parts = normalizedPath.split("/").filter(Boolean);

        // Skip common prefixes like 'api'
        let startIndex = 0;
        if (parts.length > 0 && parts[0] === "api") {
            startIndex = 1;
        }

        // Skip version prefixes (v1, v2, etc.)
        if (parts.length > startIndex && /^v\d+$/i.test(parts[startIndex])) {
            startIndex++;
        }

        // Extract domain (next segment after version/api prefix)
        const domain = parts[startIndex] || "default";
        return this.capitalizeDomain(domain);
    }

    /**
     * Capitalize domain name for collection display
     */
    private capitalizeDomain(domain: string): string {
        return domain
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    /**
     * Check if a file is relevant for route detection
     */
    private isRelevantFile(filePath: string): boolean {
        // Match TypeScript/JavaScript files that could contain routes
        if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
            return false;
        }

        // Exclude common non-route files
        if (
            filePath.includes("node_modules") ||
            filePath.includes(".test.") ||
            filePath.includes(".spec.") ||
            filePath.includes("__tests__")
        ) {
            return false;
        }

        // Match common route patterns
        const routePatterns = [
            /route\.(ts|js)$/, // Next.js app router
            /\[.*\].*\.(ts|js)$/, // Next.js dynamic routes
            /pages\/api\//, // Next.js pages router
            /\.controller\.(ts|js)$/, // NestJS controllers
            /\.router\.(ts|js)$/, // tRPC routers
            /trpc\//, // tRPC directory
        ];

        return routePatterns.some((pattern) => pattern.test(filePath));
    }

    /**
     * Check if auto-sync is enabled in settings
     */
    private isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration("watchapi");
        return config.get<boolean>(
            "autoSync.enabled",
            FILE_WATCHER_CONFIG.ENABLED_BY_DEFAULT,
        );
    }

    /**
     * Manually enable/disable auto-sync
     */
    setEnabled(enabled: boolean): void {
        vscode.workspace
            .getConfiguration("watchapi")
            .update("autoSync.enabled", enabled, true);
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.disposables.forEach((d) => d.dispose());
        logger.info("FileWatcherService disposed");
    }
}
