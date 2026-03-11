/**
 * File Watcher Service
 * Watches for source file saves and triggers automatic endpoint sync
 */

import * as vscode from "vscode";
import { detectAndParseRoutes, hasAnyProjectType } from "@watchapi/parsers";
import { CollectionsTreeProvider } from "@/modules/collections";
import { logger } from "@/shared/logger";
import { FILE_WATCHER_CONFIG } from "@/shared/constants";
import type { SyncConfigModal } from "./ui/sync-config-modal";

export class FileWatcherService implements vscode.Disposable {
    private debounceTimer: NodeJS.Timeout | null = null;
    private pendingFiles = new Set<string>();
    private isSyncing = false;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private syncConfigModal: SyncConfigModal,
        private treeProvider: CollectionsTreeProvider,
        context: vscode.ExtensionContext,
    ) {
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

    async runFullSync(): Promise<void> {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            const workspaceRoot =
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            logger.info("Running full sync on activation...");

            const parserLogger = logger.createParserLogger();
            const result = await detectAndParseRoutes(workspaceRoot, {
                logger: parserLogger,
            });

            if (!hasAnyProjectType(result.detected) || result.routes.length === 0) {
                logger.info("No routes found during full sync");
                return;
            }

            logger.info(`Found ${result.routes.length} routes, syncing...`);
            await this.syncConfigModal.syncRoutesSilent(result.routes);
            this.treeProvider.refresh();
            logger.info("Full sync complete");
        } catch (error) {
            logger.error("Full sync failed", error);
        } finally {
            this.isSyncing = false;
        }
    }

    private handleSave(doc: vscode.TextDocument): void {
        if (!this.isEnabled() || !this.isRelevantFile(doc.fileName)) return;

        logger.debug(`File saved: ${doc.fileName}`);
        this.pendingFiles.add(doc.fileName);
        this.scheduleSync();
    }

    private scheduleSync(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(
            () => this.executeSync(),
            FILE_WATCHER_CONFIG.DEBOUNCE_MS,
        );
    }

    private async executeSync(): Promise<void> {
        if (this.isSyncing || this.pendingFiles.size === 0) return;

        this.isSyncing = true;
        const changedFiles = new Set(this.pendingFiles);
        this.pendingFiles.clear();

        try {
            const workspaceRoot =
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            const parserLogger = logger.createParserLogger();
            const result = await detectAndParseRoutes(workspaceRoot, {
                logger: parserLogger,
            });

            if (!hasAnyProjectType(result.detected)) return;

            const affectedRoutes = result.routes.filter((r) =>
                changedFiles.has(r.filePath),
            );

            if (affectedRoutes.length === 0) return;

            logger.info(
                `Auto-syncing ${affectedRoutes.length} routes from ${changedFiles.size} file(s)`,
            );
            await this.syncConfigModal.syncRoutesSilent(affectedRoutes);
            this.treeProvider.refresh();
            logger.info("Auto-sync complete");
        } catch (error) {
            logger.error("Auto-sync failed", error);
        } finally {
            this.isSyncing = false;
        }
    }

    private isRelevantFile(filePath: string): boolean {
        if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return false;
        if (
            filePath.includes("node_modules") ||
            filePath.includes(".test.") ||
            filePath.includes(".spec.") ||
            filePath.includes("__tests__")
        ) {
            return false;
        }

        const routePatterns = [
            /route\.(ts|js)$/,
            /\[.*\].*\.(ts|js)$/,
            /pages\/api\//,
            /\.controller\.(ts|js)$/,
            /\.router\.(ts|js)$/,
            /trpc\//,
        ];
        return routePatterns.some((p) => p.test(filePath));
    }

    private isEnabled(): boolean {
        return vscode.workspace
            .getConfiguration("watchapi")
            .get<boolean>("autoSync.enabled", FILE_WATCHER_CONFIG.ENABLED_BY_DEFAULT);
    }

    setEnabled(enabled: boolean): void {
        vscode.workspace
            .getConfiguration("watchapi")
            .update("autoSync.enabled", enabled, true);
    }

    dispose(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.disposables.forEach((d) => d.dispose());
        logger.info("FileWatcherService disposed");
    }
}
