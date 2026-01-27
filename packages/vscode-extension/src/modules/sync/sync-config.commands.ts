/**
 * Sync config command handlers
 * Commands: CONFIGURE_SYNC, SYNC_FROM_CODE
 */

import * as vscode from "vscode";
import { COMMANDS, logger } from "@/shared";
import { wrapCommandWithRefresh } from "@/shared/command-wrapper";
import { detectAndParseRoutes, hasAnyProjectType } from "@watchapi/parsers";
import type { SyncConfigModal } from "./ui/sync-config-modal";
import type { CollectionsTreeProvider } from "@/modules/collections";

export function registerSyncConfigCommands(
    context: vscode.ExtensionContext,
    syncConfigModal: SyncConfigModal,
    treeProvider: CollectionsTreeProvider,
): void {
    // Configure sync command - Detect routes and show selection modal
    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.CONFIGURE_SYNC,
            wrapCommandWithRefresh(
                {
                    commandName: "configureSync",
                    errorMessagePrefix: "Configure sync failed",
                },
                async () => {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showWarningMessage(
                            "No workspace folder found. Please open a folder first.",
                        );
                        return;
                    }

                    const rootDir = workspaceFolders[0].uri.fsPath;

                    // Show progress while detecting and parsing routes
                    const parserLogger = logger.createParserLogger();
                    const result = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: "Detecting API routes...",
                        },
                        async () => detectAndParseRoutes(rootDir, { logger: parserLogger }),
                    );

                    if (!hasAnyProjectType(result.detected)) {
                        vscode.window.showWarningMessage(
                            "No supported project type detected. This feature requires Next.js, tRPC, NestJS, or Payload CMS.",
                        );
                        return;
                    }

                    await syncConfigModal.show(result.routes);
                },
                () => treeProvider.refresh(),
            ),
        ),
    );

    // Sync from code command - One-click sync without modal
    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.SYNC_FROM_CODE,
            wrapCommandWithRefresh(
                {
                    commandName: "syncFromCode",
                    errorMessagePrefix: "Sync failed",
                },
                async () => {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (!workspaceFolders || workspaceFolders.length === 0) {
                        vscode.window.showWarningMessage(
                            "No workspace folder found. Please open a folder first.",
                        );
                        return;
                    }

                    const rootDir = workspaceFolders[0].uri.fsPath;

                    // Show progress while detecting, parsing, and syncing routes
                    const parserLogger = logger.createParserLogger();
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: "Syncing from code...",
                            cancellable: false,
                        },
                        async () => {
                            const result = await detectAndParseRoutes(rootDir, { logger: parserLogger });

                            if (!hasAnyProjectType(result.detected)) {
                                vscode.window.showWarningMessage(
                                    "No supported project type detected. This feature requires Next.js, tRPC, NestJS, or Payload CMS.",
                                );
                                return;
                            }

                            // Sync all routes without showing selection modal
                            await syncConfigModal.syncAll(result.routes);
                        },
                    );
                },
                () => treeProvider.refresh(),
            ),
        ),
    );
}
