/**
 * Endpoint command handlers
 * Commands: ADD_ENDPOINT, DELETE_ENDPOINT, watchapi.findEndpoint, watchapi.openEndpoint
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand, wrapCommandWithRefresh } from "./command-wrapper";
import type { EndpointsService } from "@/endpoints";
import type { CollectionNode, EndpointNode } from "@/collections";
import type { CollectionsTreeProvider } from "@/collections";
import type { ApiEndpoint } from "@/shared/types";
import { openEndpointEditor } from "@/endpoints/endpoints.editor";

export function registerEndpointCommands(
  context: vscode.ExtensionContext,
  endpointsService: EndpointsService,
  treeProvider: CollectionsTreeProvider,
): void {
  // Add endpoint command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.ADD_ENDPOINT,
      wrapCommandWithRefresh(
        {
          commandName: "addEndpoint",
          errorMessagePrefix: "Failed to create endpoint",
        },
        async (collectionNode: CollectionNode) => {
          await endpointsService.createInteractive(
            collectionNode.collection.id,
          );
        },
        () => treeProvider.refresh(),
      ),
    ),
  );

  // Delete endpoint command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.DELETE_ENDPOINT,
      wrapCommandWithRefresh(
        {
          commandName: "deleteEndpoint",
          errorMessagePrefix: "Failed to delete endpoint",
        },
        async (item: EndpointNode, items?: EndpointNode[]) => {
          const targets = items?.length ? items : [item];
          if (!targets.length) return;

          const endpointIds = targets.map((n) => n.endpoint.id);
          const confirmed = await endpointsService.confirmBulkDelete(
            endpointIds,
          );

          if (confirmed) {
            await endpointsService.bulkDelete(endpointIds);
          }
        },
        () => treeProvider.refresh(),
      ),
    ),
  );

  // Open endpoint command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.openEndpoint",
      wrapCommand(
        {
          commandName: "openEndpoint",
          errorMessagePrefix: "Failed to open endpoint",
        },
        async (endpoint: ApiEndpoint) => {
          await openEndpointEditor(endpoint);
        },
      ),
    ),
  );

  // Find endpoint command (search)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.findEndpoint",
      wrapCommand(
        {
          commandName: "findEndpoint",
          errorMessagePrefix: "Failed to find endpoint",
        },
        async () => {
          const items = await endpointsService.getEndpointPickItems();

          if (!items.length) {
            vscode.window.showInformationMessage("No endpoints found");
            return;
          }

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Search endpoints",
            matchOnDescription: true,
            matchOnDetail: true,
          });

          if (selected) {
            await openEndpointEditor(selected.endpoint);
          }
        },
      ),
    ),
  );
}
