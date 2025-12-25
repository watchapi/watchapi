import * as vscode from "vscode";
import { CollectionEndpoint } from "../models/collection";
import { HttpMethod } from "../models/request";
import { CollectionTreeItem } from "../providers/collection-tree-item";
import { EndpointTreeItem } from "../providers/endpoint-tree-item";
import {
  inferHttpFilename,
  openWatchapiHttpFile,
} from "../services/editor.service";
import { buildRequestDocument } from "../documents/request-document";
import { confirmDelete } from "../ui/confirm-delete";
import { inferEndpointName } from "../utils/infer-endpoint-name";
import { promptForRequest } from "../ui/prompt-for-request";
import { CollectionsProvider } from "../collections/collections.provider";
import { VirtualRequestFileSystemProvider } from "../providers/virtual-request-file-system";

type CollectionsService = {
  createCollection: (name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  renameCollection: (input: { id: string; name: string }) => Promise<void>;
  createEndpoint: (input: {
    collectionId: string;
    name: string;
    url: string;
    method: HttpMethod;
  }) => Promise<void>;
  deleteEndpoint: (id: string) => Promise<void>;
};

export function registerCollectionsCommands(
  context: vscode.ExtensionContext,
  deps: {
    collectionsService: CollectionsService;
    collectionsProvider: CollectionsProvider;
    treeView: vscode.TreeView<vscode.TreeItem>;
    virtualFs: VirtualRequestFileSystemProvider;
  },
) {
  const { collectionsService, collectionsProvider, treeView, virtualFs } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.collections.create", async () => {
      const name = await vscode.window.showInputBox({
        prompt: "Collection name",
        placeHolder: "My API",
      });
      if (!name?.trim()) {
        return;
      }

      try {
        await collectionsService.createCollection(name.trim());
        await collectionsProvider.pullAndRefresh();
      } catch (error) {
        console.error(error);
        vscode.window.showErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to create collection",
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.deleteSelected",
      async () => {
        const selected = treeView.selection[0];
        if (!selected) {
          return;
        }

        if (selected instanceof CollectionTreeItem) {
          await vscode.commands.executeCommand(
            "watchapi.collections.deleteCollection",
            selected,
          );
          return;
        }

        if (selected instanceof EndpointTreeItem) {
          await vscode.commands.executeCommand(
            "watchapi.collections.deleteEndpoint",
            selected,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.addEndpoint",
      async (item?: CollectionTreeItem) => {
        if (!item) {
          return;
        }

        const request = await promptForRequest();
        if (!request) {
          return;
        }

        try {
          const suggestedName = inferEndpointName(request.url);
          const name = await vscode.window.showInputBox({
            prompt: "Endpoint name",
            placeHolder: suggestedName,
            value: suggestedName,
          });

          await collectionsService.createEndpoint({
            collectionId: item.collection.id,
            name: name?.trim() || suggestedName,
            url: request.url,
            method: request.method,
          });
          await collectionsProvider.pullAndRefresh();
        } catch (error) {
          console.error(error);
          vscode.window.showErrorMessage(
            error instanceof Error ? error.message : "Failed to add endpoint",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.openEndpoint",
      async (endpoint?: CollectionEndpoint) => {
        if (!endpoint) {
          return;
        }

        const content = await buildRequestDocument(endpoint);
        await openWatchapiHttpFile({
          content,
          filename: inferHttpFilename({
            name: endpoint.name,
            method: endpoint.method,
            url: endpoint.url,
          }),
          endpointId: endpoint.id,
          preserveFocus: true,
          provider: virtualFs,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.deleteCollection",
      async (item?: CollectionTreeItem) => {
        if (!item) {
          return;
        }

        const confirmed = await confirmDelete(
          `Delete collection "${item.collection.name}"?`,
        );
        if (!confirmed) {
          return;
        }

        try {
          await collectionsService.deleteCollection(item.collection.id);
          await collectionsProvider.pullAndRefresh();
        } catch (error) {
          console.error(error);
          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to delete collection",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.deleteEndpoint",
      async (item?: EndpointTreeItem) => {
        if (!item) {
          return;
        }

        const confirmed = await confirmDelete(
          `Delete endpoint "${item.endpoint.method} ${item.endpoint.url}"?`,
        );
        if (!confirmed) {
          return;
        }

        try {
          await collectionsService.deleteEndpoint(item.endpoint.id);
          await collectionsProvider.pullAndRefresh();
        } catch (error) {
          console.error(error);
          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to delete endpoint",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.renameCollection",
      async (item?: CollectionTreeItem) => {
        if (!item) {
          return;
        }

        const nextName = await vscode.window.showInputBox({
          prompt: "Rename collection",
          value: item.collection.name,
        });
        if (!nextName?.trim() || nextName.trim() === item.collection.name) {
          return;
        }

        try {
          await collectionsService.renameCollection({
            id: item.collection.id,
            name: nextName.trim(),
          });
          await collectionsProvider.pullAndRefresh();
        } catch (error) {
          console.error(error);
          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to rename collection",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.refresh",
      async () => {
        try {
          await collectionsProvider.pullAndRefresh();
        } catch (error) {
          console.error(error);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.collections.more", async () => {
      const picked = await vscode.window.showQuickPick(
        [
          {
            label: "Login",
            description: "Open WatchAPI login (keep your guest session)",
            command: "watchapi.auth.openWebLogin",
          },
        ],
        { placeHolder: "WatchAPI" },
      );
      if (!picked) {
        return;
      }

      await vscode.commands.executeCommand(picked.command);
    }),
  );
}
