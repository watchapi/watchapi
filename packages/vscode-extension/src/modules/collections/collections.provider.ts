/**
 * Collections Tree Data Provider
 * Implements VS Code TreeView for collections sidebar
 */

import * as vscode from "vscode";
import { CollectionsService } from "./collections.service";
import { EndpointsService } from "@/modules/endpoints/endpoints.service";
import { logger } from "@/shared/logger";
import type { Collection } from "./collections.types";
import type { ApiEndpoint } from "@/modules/endpoints/endpoints.types";

/**
 * Tree item types
 */
type CollectionTreeNode = CollectionNode | EndpointNode;

export class CollectionNode {
  constructor(
    public readonly collection: Collection,
    public readonly endpoints: ApiEndpoint[],
  ) {}
}

export class EndpointNode {
  constructor(
    public readonly endpoint: ApiEndpoint,
    public readonly collection?: Collection,
    public readonly duplicateIndex?: number,
  ) {}
}

/**
 * TreeDataProvider implementation for collections
 */
export class CollectionsTreeProvider
  implements vscode.TreeDataProvider<CollectionTreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CollectionTreeNode | undefined | void
  >();
  private filter = "";
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collectionsService: CollectionsService;
  private endpointsService: EndpointsService;

  constructor(
    collectionsService: CollectionsService,
    endpointsService: EndpointsService,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.collectionsService = collectionsService;
    this.endpointsService = endpointsService;
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    logger.debug("Refreshing collections tree view");
    this._onDidChangeTreeData.fire();
  }

  setFilter(value: string) {
    this.filter = value.toLowerCase();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: CollectionTreeNode): vscode.TreeItem {
    if (element instanceof CollectionNode) {
      return this.createCollectionTreeItem(element);
    } else {
      return this.createEndpointTreeItem(element);
    }
  }

  /**
   * Get children of a tree element
   */
  async getChildren(
    element?: CollectionTreeNode,
  ): Promise<CollectionTreeNode[]> {
    try {
      // Root level: return collections
      if (!element) {
        return await this.getCollections();
      }

      // Collection level: return endpoints with duplicate indices
      if (element instanceof CollectionNode) {
        const nameCounts = new Map<string, number>();

        return element.endpoints.map((endpoint) => {
          const nameKey = endpoint.name.toLowerCase();
          const count = (nameCounts.get(nameKey) || 0) + 1;
          nameCounts.set(nameKey, count);

          // Only set duplicateIndex if this is 2nd or later occurrence
          const duplicateIndex = count > 1 ? count : undefined;

          return new EndpointNode(endpoint, element.collection, duplicateIndex);
        });
      }

      // Endpoint level: no children
      return [];
    } catch (error) {
      logger.error("Failed to get tree children", error);
      vscode.window.showErrorMessage(`Failed to load collections: ${error}`);
      return [];
    }
  }

  /**
   * Get all collections with their endpoints
   */
  private async getCollections(): Promise<CollectionNode[]> {
    const collections = await this.collectionsService.getAll();
    const allEndpoints = await this.endpointsService.getAll();

    return collections.map((collection) => {
      const endpoints = allEndpoints.filter(
        (ep) => ep.collectionId === collection.id,
      );
      return new CollectionNode(collection, endpoints);
    });
  }

  /**
   * Create TreeItem for a collection
   */
  private createCollectionTreeItem(node: CollectionNode): vscode.TreeItem {
    const { collection, endpoints } = node;
    const item = new vscode.TreeItem(
      collection.name,
      vscode.TreeItemCollapsibleState.Collapsed,
    );

    item.id = `collection-${collection.id}`;
    item.description = `${endpoints.length} endpoint${
      endpoints.length !== 1 ? "s" : ""
    }`;
    item.iconPath = new vscode.ThemeIcon("layers");
    item.contextValue = "collection";

    // Add tooltip
    item.tooltip = new vscode.MarkdownString();
    item.tooltip.appendMarkdown(`**${collection.name}**\n\n`);
    if (collection.description) {
      item.tooltip.appendMarkdown(`${collection.description}\n\n`);
    }
    item.tooltip.appendMarkdown(`Endpoints: ${endpoints.length}`);

    return item;
  }

  /**
   * Create TreeItem for an endpoint
   */
  private createEndpointTreeItem(node: EndpointNode): vscode.TreeItem {
    const { endpoint } = node;
    const item = new vscode.TreeItem(
      endpoint.name,
      vscode.TreeItemCollapsibleState.None,
    );

    item.id = `endpoint-${endpoint.id}`;

    item.contextValue = "endpoint";

    // Set icon based on HTTP method
    item.iconPath = CollectionsTreeProvider.getMethodIconPath(
      this.context,
      endpoint.method,
    );

    // Add tooltip
    item.tooltip = new vscode.MarkdownString();
    item.tooltip.appendMarkdown(`**${endpoint.name}**\n\n`);
    item.tooltip.appendMarkdown(`Method: \`${endpoint.method}\`\n\n`);
    item.tooltip.appendMarkdown(`Template: \`${endpoint.pathTemplate}\`\n\n`);
    item.tooltip.appendMarkdown(`Request: \`${endpoint.requestPath}\`\n\n`);
    item.tooltip.appendMarkdown(
      `Status: ${endpoint.isActive ? "🟢 Active" : "🔴 Inactive"}`,
    );

    // Make item clickable to open .http file
    item.command = {
      command: "watchapi.openEndpoint",
      title: "Open Endpoint",
      arguments: [endpoint, node.collection?.name, node.duplicateIndex],
    };

    return item;
  }

  static getMethodIconPath(
    context: vscode.ExtensionContext,
    method: string,
  ): vscode.IconPath {
    const icon = method.toLowerCase();

    return {
      light: vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "http",
        `${icon}.svg`,
      ),
      dark: vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "http",
        `${icon}.svg`,
      ),
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
