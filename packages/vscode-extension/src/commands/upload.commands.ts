/**
 * Upload command handlers
 * Commands: UPLOAD_ENDPOINTS
 */

import * as vscode from "vscode";
import { COMMANDS, logger } from "@/shared";
import { wrapCommandWithRefresh } from "./command-wrapper";
import { detectAndParseRoutes, hasAnyProjectType } from "@watchapi/parsers";
import type { UploadModal } from "@/ui";
import type { CollectionsTreeProvider } from "@/collections";

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

                    await uploadModal.show(result.routes);
                },
                () => treeProvider.refresh(),
            ),
        ),
    );
}
