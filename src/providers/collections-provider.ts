import * as vscode from "vscode";
import { Collection } from "../models/collection";
import { CoreApiService } from "../services/core-api.service";
import { CollectionTreeItem } from "./collection-tree-item";
import { EndpointTreeItem } from "./endpoint-tree-item";

export class CollectionsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collections: Collection[] | null = null;
  private loading: Promise<void> | null = null;
  private lastError: unknown = null;

  constructor(private readonly service: CoreApiService) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  async pullAndRefresh() {
    await this.pull();
    this.refresh();
  }

  getTreeItem(el: vscode.TreeItem) {
    return el;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      return this.getRootChildren();
    }

    if (element instanceof CollectionTreeItem) {
      return element.collection.endpoints.map(
        (endpoint) => new EndpointTreeItem(element.collection, endpoint),
      );
    }

    return [];
  }

  private async getRootChildren(): Promise<vscode.TreeItem[]> {
    await this.ensureLoaded();

    if (this.lastError) {
      const item = new vscode.TreeItem(
        "Unable to load collections (check settings)",
        vscode.TreeItemCollapsibleState.None,
      );
      item.description =
        this.lastError instanceof Error ? this.lastError.message : undefined;
      item.command = {
        command: "watchapi.openSettings",
        title: "Open Settings",
      };
      return [item];
    }

    return (this.collections ?? []).map(
      (collection) => new CollectionTreeItem(collection),
    );
  }

  private async ensureLoaded() {
    if (this.collections) {
      return;
    }
    await this.pull();
  }

  private async pull() {
    if (this.loading) {
      return this.loading;
    }

    this.loading = (async () => {
      try {
        this.lastError = null;
        this.collections = await this.service.pullCollections();
      } catch (error) {
        this.lastError = error;
        this.collections = [];
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }
}
