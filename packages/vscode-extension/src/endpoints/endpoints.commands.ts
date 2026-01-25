/**
 * Endpoint command handlers
 * Commands: ADD_ENDPOINT, DELETE_ENDPOINT, watchapi.findEndpoint, watchapi.openEndpoint
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand, wrapCommandWithRefresh } from "@/commands/command-wrapper";
import type { EndpointsService } from "@/endpoints";
import type { CollectionNode, EndpointNode } from "@/collections";
import type { CollectionsTreeProvider } from "@/collections";
import type { CollectionsService } from "@/collections";
import type { ApiEndpoint } from "@/shared/types";
import { openEndpointEditor } from "@/endpoints/endpoints.editor";

export function registerEndpointCommands(
  context: vscode.ExtensionContext,
  endpointsService: EndpointsService,
  treeProvider: CollectionsTreeProvider,
  collectionsService: CollectionsService,
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
        async (
          endpoint: ApiEndpoint,
          collectionName?: string,
          duplicateIndex?: number,
        ) => {
          // If collection name not provided, look it up
          let name = collectionName;
          if (!name && endpoint.collectionId) {
            try {
              const collection = await collectionsService.getById(
                endpoint.collectionId,
              );
              name = collection.name;
            } catch {
              // Fall back to default
            }
          }
          await openEndpointEditor(endpoint, name, duplicateIndex);
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
            // Look up collection name and calculate duplicate index
            let collectionName: string | undefined;
            let duplicateIndex: number | undefined;

            if (selected.endpoint.collectionId) {
              try {
                const collection = await collectionsService.getById(
                  selected.endpoint.collectionId,
                );
                collectionName = collection.name;

                // Calculate duplicate index within collection
                const allEndpoints = await endpointsService.getAll();
                const collectionEndpoints = allEndpoints.filter(
                  (e) => e.collectionId === selected.endpoint.collectionId,
                );

                const nameKey = selected.endpoint.name.toLowerCase();
                let count = 0;
                for (const ep of collectionEndpoints) {
                  if (ep.name.toLowerCase() === nameKey) {
                    count++;
                    if (ep.id === selected.endpoint.id) {
                      duplicateIndex = count > 1 ? count : undefined;
                      break;
                    }
                  }
                }
              } catch {
                // Fall back to default
              }
            }
            await openEndpointEditor(
              selected.endpoint,
              collectionName,
              duplicateIndex,
            );
          }
        },
      ),
    ),
  );
}
