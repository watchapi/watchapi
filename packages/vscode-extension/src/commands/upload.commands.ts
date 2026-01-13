/**
 * Upload command handlers
 * Commands: UPLOAD_ENDPOINTS
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommandWithRefresh } from "./command-wrapper";
import {
	parseAllNextJsRoutes,
	parseTRPCRouters,
	hasNextJs,
	hasTRPC,
	parseNestJsRoutes,
	hasNestJs,
} from "@watchapi/parsers";
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
					const [hasNext, hasTrpc, hasNest] = await Promise.all([
						hasNextJs(),
						hasTRPC(),
						hasNestJs(),
					]);

					if (!hasNext && !hasTrpc && !hasNest) {
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
							const [nextRoutes, trpcRoutes, nestRoutes] = await Promise.all([
								hasNext ? parseAllNextJsRoutes() : [],
								hasTrpc ? parseTRPCRouters() : [],
								hasNest ? parseNestJsRoutes() : [],
							]);
							return [...nextRoutes, ...trpcRoutes, ...nestRoutes];
						},
					);

					await uploadModal.show(routes);
				},
				() => treeProvider.refresh(),
			),
		),
	);
}
