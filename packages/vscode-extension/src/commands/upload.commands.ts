/**
 * Upload command handlers
 * Commands: UPLOAD_ENDPOINTS
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommandWithRefresh } from "./command-wrapper";
import {
    parseTRPCRouters,
    hasTRPC,
    parseNestJsRoutes,
    hasNestJs,
    parseNextAppRoutes,
    hasNextApp,
    hasNextPages,
    parseNextPagesRoutes,
    type ParsedRoute,
} from "@watchapi/parsers";
import type { UploadModal } from "@/ui";
import type { CollectionsTreeProvider } from "@/collections";

/**
 * Get workspace root directory
 */
function getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
}

export function registerUploadCommands(
    context: vscode.ExtensionContext,
    uploadModal: UploadModal,
    treeProvider: CollectionsTreeProvider,
): void {
    // Upload endpoints command - Detect and upload routes
    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.UPLOAD_ENDPOINTS,
            wrapCommandWithRefresh(
                {
                    commandName: "uploadEndpoints",
                    errorMessagePrefix: "Upload failed",
                },
                async () => {
                    const rootDir = getWorkspaceRoot();
                    if (!rootDir) {
                        vscode.window.showWarningMessage(
                            "No workspace folder found.",
                        );
                        return;
                    }

                    // Refactored parsers (synchronous, require rootDir)
                    const hasNextjsApp = hasNextApp(rootDir);
                    const hasTrpc = hasTRPC(rootDir);

                    // VSCode-dependent parsers (async)
                    const [hasNextjsPages, hasNest] = await Promise.all([
                        hasNextPages(),
                        hasNestJs(),
                    ]);

                    if (
                        !hasNextjsApp &&
                        !hasNextjsPages &&
                        !hasTrpc &&
                        !hasNest
                    ) {
                        vscode.window.showWarningMessage(
                            "No supported project type detected. This feature requires Next.js, tRPC, or NestJS.",
                        );
                        return;
                    }

                    // Show progress while detecting routes
                    const routes = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: "Detecting API routes...",
                        },
                        async () => {
                            const allRoutes: ParsedRoute[] = [];

                            // Refactored parsers - pass options with rootDir
                            if (hasNextjsApp) {
                                const result = parseNextAppRoutes({ rootDir });
                                allRoutes.push(...result.routes);
                            }

                            if (hasTrpc) {
                                const result = parseTRPCRouters({ rootDir });
                                allRoutes.push(...result.routes);
                            }

                            // VSCode-dependent parsers - old async API
                            const [nextPagesRoutes, nestRoutes] =
                                await Promise.all([
                                    hasNextjsPages
                                        ? parseNextPagesRoutes()
                                        : Promise.resolve([]),
                                    hasNest
                                        ? parseNestJsRoutes()
                                        : Promise.resolve([]),
                                ]);

                            allRoutes.push(...nextPagesRoutes, ...nestRoutes);

                            return allRoutes;
                        },
                    );

                    await uploadModal.show(routes);
                },
                () => treeProvider.refresh(),
            ),
        ),
    );
}
