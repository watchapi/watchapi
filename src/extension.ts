import * as vscode from "vscode";
import { ActivityItem, Method } from "./models/activity";
import { CollectionEndpoint } from "./models/collection";
import { ActivityProvider } from "./providers/activity-provider";
import { ActivityStore } from "./storage/activity-store";
import { ActivityTreeItem } from "./providers/activity-tree-item";
import { CollectionsProvider } from "./providers/collections-provider";
import { CollectionTreeItem } from "./providers/collection-tree-item";
import { EndpointTreeItem } from "./providers/endpoint-tree-item";
import { openSavedHttpFile } from "./services/editor.service";
import { buildRequestDocument } from "./documents/request-document";
import {
  ensureGuestLogin,
  upgradeGuestWithCredentials,
} from "./services/auth.service";
import { CoreApiService } from "./services/core-api.service";

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "watchapi-client" is now active!',
  );

  const store = new ActivityStore(context);
  const activityProvider = new ActivityProvider(store);

  const coreApi = new CoreApiService(context);
  const collectionsService = coreApi;
  const collectionsProvider = new CollectionsProvider(collectionsService);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "watchapi.activity",
      activityProvider,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "watchapi.collections",
      collectionsProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.activity.add",
      async (method: ActivityItem["method"], url: ActivityItem["url"]) => {
        const item = {
          id: crypto.randomUUID(),
          method,
          url,
          timestamp: Date.now(),
        } as const;
        await store.add(item);
        activityProvider.refresh();
        await setHasActivityContext(store);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.newRequest", async () => {
      const request = await promptForRequest();
      if (!request) {
        return;
      }

      const item = {
        id: crypto.randomUUID(),
        method: request.method,
        url: request.url,
        timestamp: request.timestamp,
      } as const;
      await store.add(item);
      activityProvider.refresh();
      await setHasActivityContext(store);
      await vscode.commands.executeCommand("watchapi.activity.open", item);
    }),
  );

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

        const content = buildRequestDocument(endpoint);
        await openSavedHttpFile(content);
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
    vscode.commands.registerCommand("watchapi.activity.clear", async () => {
      await store.clear();
      activityProvider.refresh();
      activityProvider.setFilter("");
      await setHasActivityContext(store);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.activity.open",
      async (activity?: ActivityTreeItem["activity"]) => {
        if (!activity) {
          return;
        }

        const content = buildRequestDocument(activity);
        await openSavedHttpFile(content);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.activity.delete",
      async (item: ActivityTreeItem) => {
        if (!item.activity.id) {
          return;
        }
        await store.deleteById(item.activity.id);
        activityProvider.refresh();
        await setHasActivityContext(store);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.activity.filter", async () => {
      const next = await vscode.window.showInputBox({
        prompt: "Filter activity (matches URL)",
        value: activityProvider.getFilter(),
      });
      if (next === undefined) {
        return;
      }
      activityProvider.setFilter(next);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.activity.seed", async () => {
      await seedActivity(store);
      activityProvider.refresh();
      await setHasActivityContext(store);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.openSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:watchapi.watchapi-client",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.auth.login", async () => {
      try {
        const email = await vscode.window.showInputBox({
          prompt: "Email",
          placeHolder: "you@example.com",
        });
        if (!email?.trim()) {
          return;
        }

        const name = await vscode.window.showInputBox({
          prompt: "Name (optional)",
          placeHolder: "Jane Doe",
        });

        const password = await vscode.window.showInputBox({
          prompt: "Password",
          password: true,
        });
        if (!password) {
          return;
        }

        await ensureGuestLogin(context);

        const result = await upgradeGuestWithCredentials(context, {
          email: email.trim(),
          name: name?.trim() || undefined,
          password,
        });

        if (result.requiresEmailVerification) {
          vscode.window.showInformationMessage(
            `Logged in as ${result.user.email}. Check your email to verify your account.`,
          );
        } else {
          vscode.window.showInformationMessage(
            `Logged in as ${result.user.email}.`,
          );
        }
      } catch (error) {
        console.error(error);
        vscode.window.showErrorMessage(
          error instanceof Error ? error.message : "Login failed",
        );
      }
    }),
  );

  void setHasActivityContext(store);

  void ensureGuestLogin(context).catch((error) => {
    console.error("Guest login failed:", error);
  });
}

export function deactivate() {}

async function promptForRequest() {
  const methods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ] as const satisfies readonly Method[];
  const picked = await vscode.window.showQuickPick(
    methods.map((method) => ({ label: method, method })),
    { placeHolder: "HTTP method" },
  );
  if (!picked) {
    return;
  }

  const url = await vscode.window.showInputBox({
    prompt: "Request URL",
    placeHolder: "https://api.example.com/v1/health",
  });
  if (!url) {
    return;
  }

  return { method: picked.method, url, timestamp: Date.now() } as const;
}

async function confirmDelete(message: string) {
  const confirm = "Delete";
  const picked = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    confirm,
  );
  return picked === confirm;
}

function inferEndpointName(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

async function setHasActivityContext(store: ActivityStore) {
  await vscode.commands.executeCommand(
    "setContext",
    "watchapi:hasActivity",
    store.getAll().length > 0,
  );
}

async function seedActivity(store: ActivityStore) {
  const now = Date.now();
  const seed: Array<{
    method: ActivityItem["method"];
    url: ActivityItem["url"];
    timestamp: ActivityItem["timestamp"];
  }> = [
    {
      method: "POST",
      url: "http://localhost:3000",
      timestamp: now - 15552000000,
    },
    {
      method: "POST",
      url: "http://localhost:3000/api/contact-us",
      timestamp: now - 18144000000,
    },
    {
      method: "GET",
      url: "https://shopnex.ai/api/test",
      timestamp: now - 18144000000,
    },
  ];

  for (const item of seed) {
    await store.add({
      id: crypto.randomUUID(),
      method: item.method,
      url: item.url,
      timestamp: item.timestamp,
    });
  }
}
