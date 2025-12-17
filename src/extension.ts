import * as vscode from "vscode";
import { Method } from "./models/activity";
import { ActivityProvider } from "./providers/activity-provider";
import { ActivityStore } from "./storage/activity-store";

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "watchapi-client" is now active!',
  );

  const store = new ActivityStore(context);
  const activityProvider = new ActivityProvider(store);

  const disposable = vscode.commands.registerCommand(
    "watchapi-client.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from watchapi-client!");
    },
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("watchapi.activity", activityProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.activity.add",
      async (method: Method, url: string) => {
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
      const methods = ["GET", "POST", "PUT", "DELETE"] as const satisfies readonly Method[];
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

      const item = {
        id: crypto.randomUUID(),
        method: picked.method,
        url,
        timestamp: Date.now(),
      } as const;
      await store.add(item);
      activityProvider.refresh();
      await setHasActivityContext(store);
      await vscode.commands.executeCommand("watchapi.activity.open", item);
    }),
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
      async (activity?: { method: Method; url: string; timestamp: number }) => {
        if (!activity) {
          return;
        }

        const createdAt = new Date(activity.timestamp).toISOString();
        const content = [
          `### WatchAPI Request`,
          ``,
          `${activity.method} ${activity.url}`,
          ``,
          `# Created ${createdAt}`,
          ``,
        ].join("\n");

        const doc = await vscode.workspace.openTextDocument({
          language: "http",
          content,
        });
        await vscode.window.showTextDocument(doc, { preview: true });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.activity.delete",
      async (activity?: { id: string }) => {
        if (!activity?.id) {
          return;
        }
        await store.deleteById(activity.id);
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

  void setHasActivityContext(store);

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function setHasActivityContext(store: ActivityStore) {
  await vscode.commands.executeCommand(
    "setContext",
    "watchapi:hasActivity",
    store.getAll().length > 0,
  );
}

async function seedActivity(store: ActivityStore) {
  const now = Date.now();
  const seed: Array<{ method: Method; url: string; timestamp: number }> = [
    { method: "POST", url: "http://localhost:3000", timestamp: now - 15552000000 },
    {
      method: "POST",
      url: "http://localhost:3000/api/contact-us",
      timestamp: now - 18144000000,
    },
    { method: "GET", url: "https://shopnex.ai/api/test", timestamp: now - 18144000000 },
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
