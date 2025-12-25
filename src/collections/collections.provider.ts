import * as vscode from "vscode";
import { Collection } from "../models/collection";
import { CoreApiService } from "../services/core-api.service";
import { CollectionTreeItem } from "../providers/collection-tree-item";
import { EndpointTreeItem } from "../providers/endpoint-tree-item";

type TreeItemCache = {
  collections: Map<string, CollectionTreeItem>;
  endpointsByCollection: Map<string, EndpointTreeItem[]>;
  endpointsById: Map<string, EndpointTreeItem>;
  parentByEndpointId: Map<string, CollectionTreeItem>;
};

export class CollectionsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collections: Collection[] | null = null;
  private loading: Promise<void> | null = null;
  private lastError: unknown = null;
  private treeItems: TreeItemCache | null = null;

  constructor(private readonly service: CoreApiService) {}

  refresh() {
    this.treeItems = null;
    this._onDidChangeTreeData.fire();
  }

  async pullAndRefresh() {
    await this.pull();
    this.refresh();
  }

  getTreeItem(el: vscode.TreeItem) {
    return el;
  }

  getChildren(
    element?: vscode.TreeItem,
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    return this.getChildrenInternal(element);
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

    const items = this.ensureTreeItems();
    return Array.from(items.collections.values());
  }

  private getChildrenInternal(
    element?: vscode.TreeItem,
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      return this.getRootChildren();
    }

    if (element instanceof CollectionTreeItem) {
      const items = this.ensureTreeItems();
      return items.endpointsByCollection.get(element.collection.id) ?? [];
    }

    return [];
  }

  async findEndpointItem(endpointId: string) {
    await this.ensureLoaded();
    if (this.lastError) {
      return undefined;
    }

    const items = this.ensureTreeItems();
    const endpoint = items.endpointsById.get(endpointId);
    if (!endpoint) {
      return undefined;
    }

    const parent = items.parentByEndpointId.get(endpointId);
    if (!parent) {
      return undefined;
    }

    return { endpoint, collection: parent };
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
        this.treeItems = null;
      } catch (error) {
        this.lastError = error;
        this.collections = [];
        this.treeItems = null;
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  private ensureTreeItems(): TreeItemCache {
    if (this.treeItems) {
      return this.treeItems;
    }

    const collections = this.collections ?? [];
    const collectionsMap = new Map<string, CollectionTreeItem>();
    const endpointsByCollection = new Map<string, EndpointTreeItem[]>();
    const endpointsById = new Map<string, EndpointTreeItem>();
    const parentByEndpointId = new Map<string, CollectionTreeItem>();

    for (const collection of collections) {
      const collectionItem = new CollectionTreeItem(collection);
      collectionsMap.set(collection.id, collectionItem);

      const endpointItems = collection.endpoints.map((endpoint) => {
        const item = new EndpointTreeItem(collection, endpoint);
        endpointsById.set(endpoint.id, item);
        parentByEndpointId.set(endpoint.id, collectionItem);
        return item;
      });

      endpointsByCollection.set(collection.id, endpointItems);
    }

    this.treeItems = {
      collections: collectionsMap,
      endpointsByCollection,
      endpointsById,
      parentByEndpointId,
    };

    return this.treeItems;
  }
}
