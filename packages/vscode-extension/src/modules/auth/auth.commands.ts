/**
 * Authentication command handlers
 * Commands: LOGIN, LOGOUT
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand } from "@/shared/command-wrapper";
import type { AuthService } from "@/modules/auth";
import type { SyncService } from "@/modules/sync";
import type { CollectionsTreeProvider } from "@/modules/collections";

export function registerAuthCommands(
	context: vscode.ExtensionContext,
	authService: AuthService,
	syncService: SyncService,
	treeProvider: CollectionsTreeProvider,
): void {
	// Login command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			COMMANDS.LOGIN,
			wrapCommand(
				{
					commandName: "login",
					errorMessagePrefix: "Login failed",
				},
				async () => {
					await authService.login();
				},
			),
		),
	);

	// Logout command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			COMMANDS.LOGOUT,
			wrapCommand(
				{
					commandName: "logout",
					errorMessagePrefix: "Logout failed",
				},
				async () => {
					await authService.logout();
					syncService.stopAutoSync();
					treeProvider.refresh();
				},
			),
		),
	);
}
