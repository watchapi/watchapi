/**
 * Command wrapper utility
 * Provides consistent error handling for all VS Code commands
 */

import * as vscode from "vscode";
import { logger } from "@/shared/logger";

export interface CommandOptions {
	/**
	 * Command name for logging and error messages
	 */
	commandName: string;

	/**
	 * Whether to show success notification
	 */
	showSuccessMessage?: boolean;

	/**
	 * Custom success message (overrides default)
	 */
	successMessage?: string;

	/**
	 * Custom error message prefix (default: "Command failed")
	 */
	errorMessagePrefix?: string;

	/**
	 * Whether to log errors (default: true)
	 */
	logErrors?: boolean;
}

/**
 * Wraps a command handler with consistent error handling
 *
 * @example
 * ```typescript
 * const loginCommand = wrapCommand(
 *   { commandName: 'login' },
 *   async () => {
 *     await authService.login();
 *   }
 * );
 *
 * context.subscriptions.push(
 *   vscode.commands.registerCommand(COMMANDS.LOGIN, loginCommand)
 * );
 * ```
 */
export function wrapCommand<TArgs extends unknown[]>(
	options: CommandOptions,
	handler: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
	return async (...args: TArgs) => {
		try {
			await handler(...args);

			if (options.showSuccessMessage && options.successMessage) {
				vscode.window.showInformationMessage(options.successMessage);
			}
		} catch (error) {
			const errorPrefix = options.errorMessagePrefix ?? "Command failed";
			const errorMessage = `${errorPrefix}: ${error}`;

			if (options.logErrors !== false) {
				logger.error(`Command '${options.commandName}' failed`, error);
			}

			vscode.window.showErrorMessage(errorMessage);
		}
	};
}

/**
 * Specialized wrapper for commands that need tree refresh
 */
export function wrapCommandWithRefresh<TArgs extends unknown[]>(
	options: CommandOptions,
	handler: (...args: TArgs) => Promise<void>,
	refreshCallback: () => void,
): (...args: TArgs) => Promise<void> {
	return wrapCommand(options, async (...args: TArgs) => {
		await handler(...args);
		refreshCallback();
	});
}
