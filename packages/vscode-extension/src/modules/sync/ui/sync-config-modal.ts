/**
 * Sync config modal
 * Shows detected routes and allows user to select which to sync
 */

import * as vscode from "vscode";
import { CollectionsService } from "@/modules/collections/collections.service";
import { EndpointsService } from "@/modules/endpoints/endpoints.service";
import { logger } from "@/shared/logger";
import type { ParsedRoute } from "../sync.types";
import type { Collection } from "@/modules/collections/collections.types";
import type { ApiEndpoint } from "@/modules/endpoints/endpoints.types";
import { humanizeRouteName } from "@/modules/endpoints/endpoints.editor";
import { CollectionsTreeProvider } from "@/modules/collections";

export class SyncConfigModal {
    private collectionsService: CollectionsService;
    private endpointsService: EndpointsService;

    constructor(
        collectionsService: CollectionsService,
        endpointsService: EndpointsService,
        private readonly context: vscode.ExtensionContext,
    ) {
        this.collectionsService = collectionsService;
        this.endpointsService = endpointsService;
    }

    /**
     * Show config modal with detected routes for selection
     */
    async show(routes: ParsedRoute[]): Promise<void> {
        try {
            if (routes.length === 0) {
                vscode.window.showInformationMessage(
                    "No API routes detected in this project",
                );
                return;
            }

            const routesWithNames = routes.map((r) => ({
                ...r,
                name: humanizeRouteName(r),
            }));

            logger.info(
                `Showing sync config modal with ${routesWithNames.length} routes`,
            );

            // Step 1: Select routes to sync
            const selectedRoutes = await this.selectRoutes(routesWithNames);
            if (!selectedRoutes || selectedRoutes.length === 0) {
                logger.info("Sync cancelled: no routes selected");
                return;
            }

            const routesWithDomain = this.applyDomainPrefix(selectedRoutes);

            // Step 2: Group collections
            const groups = this.groupRoutesByPrefix(routesWithDomain);

            // Step 3: Pull endpoints (override mechanism)
            await this.syncGroupedEndpoints(groups);
        } catch (error) {
            logger.error("Sync failed", error);
            vscode.window.showErrorMessage(`Sync failed: ${error}`);
        }
    }

    /**
     * Sync all routes without showing selection modal (one-click sync)
     */
    async syncAll(routes: ParsedRoute[]): Promise<void> {
        try {
            if (routes.length === 0) {
                vscode.window.showInformationMessage(
                    "No API routes detected in this project",
                );
                return;
            }

            const routesWithNames = routes.map((r) => ({
                ...r,
                name: humanizeRouteName(r),
            }));

            logger.info(`Syncing ${routesWithNames.length} routes from code`);

            const routesWithDomain = this.applyDomainPrefix(routesWithNames);

            // Group collections
            const groups = this.groupRoutesByPrefix(routesWithDomain);

            // Pull endpoints (override mechanism)
            await this.syncGroupedEndpoints(groups);
        } catch (error) {
            logger.error("Sync failed", error);
            vscode.window.showErrorMessage(`Sync failed: ${error}`);
        }
    }

    private applyDomainPrefix(routes: ParsedRoute[]): ParsedRoute[] {
        return routes.map((route) => ({
            ...route,
            path: `{{baseUrl}}${route.path}`,
        }));
    }

    /**
     * Show route selection quick pick
     */
    private async selectRoutes(
        routes: ParsedRoute[],
    ): Promise<ParsedRoute[] | undefined> {
        interface RouteQuickPickItem extends vscode.QuickPickItem {
            route: ParsedRoute;
        }

        const items: RouteQuickPickItem[] = routes.map((route) => ({
            label: route.name,
            description: route.path,
            // detail: route.filePath,
            iconPath: CollectionsTreeProvider.getMethodIconPath(
                this.context,
                route.method,
            ),
            route,
            picked: true, // Select all by default
        }));

        const selected = await vscode.window.showQuickPick(items, {
            title: "Select endpoints to sync",
            placeHolder: "Choose which endpoints to sync",
            canPickMany: true,
        });

        return selected?.map((item) => item.route);
    }

    /**
     * Declarative merge strategy configuration
     * Defines what happens for each merge scenario
     *
     * Layer Strategy:
     * - bodySchema/headersSchema: Code-inferred defaults (updated by sync)
     * - bodyOverrides/headersOverrides: User edits (never touched by sync)
     * - Runtime: effectiveBody = applyOverrides(bodySchema, bodyOverrides)
     */
    private readonly MERGE_STRATEGY = {
        // When endpoint exists in both source and destination
        onMatch: {
            action: "update" as const,
            // Only update code-owned schema fields, preserve user overrides
            fields: [
                "pathTemplate",
                "method",
                "name",
                "bodySchema",
                "headersSchema",
            ] as const,
        },
        // When endpoint exists in source but not destination
        onCreate: {
            action: "create" as const,
            // Schema starts from code, overrides start empty
            defaults: {
                bodyOverrides: null,
                headersOverrides: null,
            },
        },
        // When endpoint exists in destination but not source
        onOrphan: {
            action: "ignore" as const,
            // Leave orphaned endpoints as-is (user can manually delete if needed)
        },
    } as const;

    private async syncGroupedEndpoints(
        groups: Map<string, ParsedRoute[]>,
    ): Promise<void> {
        const existingCollections = await this.collectionsService.getAll();
        const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

        const total = Array.from(groups.values()).reduce(
            (sum, routes) => sum + routes.length,
            0,
        );

        const stats = { processed: 0, created: 0, updated: 0, deactivated: 0 };

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Pulling endpoints from source",
                cancellable: false,
            },
            async (progress) => {
                for (const [groupName, routes] of groups) {
                    const collection = await this.findOrCreateCollection(
                        existingCollections,
                        groupName,
                    );
                    const existingEndpoints =
                        await this.endpointsService.getByCollectionId(
                            collection.id,
                        );

                    // Build merge plan
                    const plan = this.buildMergePlan(
                        routes,
                        existingEndpoints,
                        workspaceRoot,
                    );

                    // Execute merge plan
                    await this.executeMergePlan(plan, collection.id, stats);

                    // Report progress
                    stats.processed += routes.length;
                    progress.report({
                        message: `${stats.processed}/${total} endpoints processed`,
                        increment: (routes.length / total) * 100,
                    });
                }

                logger.info(
                    `Pull complete: ${stats.created} created, ${stats.updated} updated, ${stats.deactivated} deactivated`,
                );
            },
        );

        this.showMergeSummary(stats);
    }

    /**
     * Build a declarative merge plan
     * Classifies each endpoint into CREATE/UPDATE/DEACTIVATE buckets
     */
    private buildMergePlan(
        sourceRoutes: ParsedRoute[],
        existingEndpoints: ApiEndpoint[],
        workspaceRoot: string,
    ) {
        const existingByExternalId = new Map(
            existingEndpoints
                .filter((e) => e.externalId)
                .map((e) => [e.externalId!, e]),
        );

        const sourceExternalIds = new Set<string>();
        const toCreate: Array<{ route: ParsedRoute; externalId: string }> = [];
        const toUpdate: Array<{ route: ParsedRoute; existing: ApiEndpoint }> =
            [];

        // Classify source routes
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

        // Find orphaned endpoints
        const toDeactivate = existingEndpoints.filter(
            (e) => e.externalId && !sourceExternalIds.has(e.externalId),
        );

        return { toCreate, toUpdate, toDeactivate };
    }

    /**
     * Execute the merge plan using the declarative strategy
     */
    private async executeMergePlan(
        plan: ReturnType<typeof this.buildMergePlan>,
        collectionId: string,
        stats: { created: number; updated: number; deactivated: number },
    ) {
        // Execute updates
        for (const { route, existing } of plan.toUpdate) {
            const updateFields = this.buildUpdatePayload(
                route,
                this.MERGE_STRATEGY.onMatch.fields,
            );
            await this.endpointsService.update(existing.id, updateFields);
            stats.updated++;
        }

        // Execute creates
        for (const { route, externalId } of plan.toCreate) {
            const createFields = this.buildCreatePayload(
                route,
                externalId,
                collectionId,
                this.MERGE_STRATEGY.onCreate.defaults,
            );
            await this.endpointsService.create(createFields);
            stats.created++;
        }

        // Skip deactivations - orphaned endpoints are ignored (left as-is)
        // Users can manually delete endpoints if needed
    }

    /**
     * Build update payload from merge strategy
     * Maps route fields to schema layers (preserves user overrides)
     */
    private buildUpdatePayload(
        route: ParsedRoute,
        fields: readonly string[],
    ): Record<string, unknown> {
        const payload: Record<string, unknown> = {};
        // Map code fields to schema layers
        const routeMap: Record<string, unknown> = {
            pathTemplate: route.path,
            method: route.method,
            name: route.name,
            bodySchema: route.body, // Code-inferred body schema
            headersSchema: route.headers, // Code-inferred headers schema
            querySchema: route.query, // Code-inferred query schema
        };

        for (const field of fields) {
            payload[field] = routeMap[field];
        }
        return payload;
    }

    /**
     * Build create payload from merge strategy
     * Initializes both schema (from code) and overrides (empty)
     */
    private buildCreatePayload(
        route: ParsedRoute,
        externalId: string,
        collectionId: string,
        defaults: Record<string, unknown>,
    ) {
        return {
            externalId,
            name: route.name,
            pathTemplate: route.path,
            requestPath: route.path,
            method: route.method,
            // Initialize schema from code
            bodySchema: route.body,
            headersSchema: route.headers,
            querySchema: route.query,
            collectionId,
            ...defaults, // Includes bodyOverrides: null, headersOverrides: null, queryOverrides: null
        };
    }

    /**
     * Find or create collection
     */
    private async findOrCreateCollection(
        existingCollections: Collection[],
        groupName: string,
    ) {
        const existing = existingCollections.find((c) => c.name === groupName);
        if (existing) return existing;

        return await this.collectionsService.create({
            name: groupName,
            description: `Auto-generated from ${groupName} routes`,
        });
    }

    /**
     * Show merge summary to user
     */
    private showMergeSummary(stats: {
        created: number;
        updated: number;
        deactivated: number;
    }) {
        const parts = [];
        if (stats.created > 0) parts.push(`${stats.created} created`);
        if (stats.updated > 0) parts.push(`${stats.updated} updated`);
        if (stats.deactivated > 0)
            parts.push(`${stats.deactivated} deactivated`);

        const summary =
            parts.length > 0 ? parts.join(", ") : "No changes needed";
        vscode.window.showInformationMessage(`Pull complete: ${summary}`);
    }

    /**
     * Group routes by prefix for suggested collection names
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
     * Extract route prefix (e.g., /v1/auth/login -> Auth, /api/users -> Users)
     * Skips version prefixes (v1, v2, etc.) and extracts the domain name
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
     * E.g., auth -> Auth, users -> Users, api-keys -> Api Keys
     */
    private capitalizeDomain(domain: string): string {
        return domain
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }
}
