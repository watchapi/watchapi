/**
 * Organization command handlers
 * Commands: SWITCH_ORGANIZATION
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand } from "./command-wrapper";
import type { AuthService } from "@/auth";
import type { OrganizationService } from "@/organizations";
import type { SyncService } from "@/sync";
import type { CollectionsTreeProvider } from "@/collections";

export function registerOrganizationCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  organizationService: OrganizationService,
  syncService: SyncService,
  treeProvider: CollectionsTreeProvider,
): void {
  // Switch organization command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.SWITCH_ORGANIZATION,
      wrapCommand(
        {
          commandName: "switchOrganization",
          errorMessagePrefix: "Failed to switch organization",
        },
        async () => {
          const selectedOrg =
            await organizationService.switchOrganizationInteractive(
              authService,
              syncService,
            );

          if (selectedOrg) {
            treeProvider.refresh();
            vscode.window.showInformationMessage(
              `Switch organization: ${selectedOrg.name}`,
            );
          }
        },
      ),
    ),
  );
}
