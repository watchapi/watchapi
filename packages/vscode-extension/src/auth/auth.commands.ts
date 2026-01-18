/**
 * Authentication command handlers
 * Commands: LOGIN, LOGOUT
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand } from "./command-wrapper";
import type { AuthService } from "@/auth";
import type { SyncService } from "@/sync";
import type { CollectionsTreeProvider } from "@/collections";

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
