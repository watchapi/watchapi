import * as vscode from "vscode";
import { CollectionsProvider } from "../collections/collections.provider";

export function registerCollectionsTreeView(
  context: vscode.ExtensionContext,
  provider: CollectionsProvider,
) {
  const treeView = vscode.window.createTreeView("watchapi.collections", {
    treeDataProvider: provider,
  });
  context.subscriptions.push(treeView);
  return treeView;
}
