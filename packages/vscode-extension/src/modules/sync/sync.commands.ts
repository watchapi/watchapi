/**
 * Sync command handlers
 * Commands: REFRESH
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared";
import { wrapCommandWithRefresh } from "@/shared/command-wrapper";
import type { SyncService } from "@/modules/sync";
import type { CollectionsTreeProvider } from "@/modules/collections";

export function registerSyncCommands(
  context: vscode.ExtensionContext,
  syncService: SyncService,
  treeProvider: CollectionsTreeProvider,
): void {
  // Refresh command - Manually trigger sync
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.REFRESH,
      wrapCommandWithRefresh(
        {
          commandName: "refresh",
          showSuccessMessage: true,
          successMessage: "Collections refreshed",
          errorMessagePrefix: "Refresh failed",
        },
        async () => {
          await syncService.sync();
        },
        () => treeProvider.refresh(),
      ),
    ),
  );
}
