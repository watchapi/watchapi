import * as vscode from "vscode";
import { Collection } from "../models/collection";

export class CollectionTreeItem extends vscode.TreeItem {
  constructor(public readonly collection: Collection) {
    super(collection.name, vscode.TreeItemCollapsibleState.Collapsed);

    this.id = collection.id;
    this.contextValue = "collectionItem";
    // this.iconPath = new vscode.ThemeIcon("server");
    this.description =
      collection.endpoints.length > 0
        ? `${collection.endpoints.length} endpoint${
            collection.endpoints.length === 1 ? "" : "s"
          }`
        : undefined;
    this.tooltip = collection.name;
  }
}
