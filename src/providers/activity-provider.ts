// providers/activity-provider.ts
import * as vscode from "vscode";
import { ActivityTreeItem } from "./activity-tree-item";
import { ActivityStore } from "../storage/activity-store";

export class ActivityProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private filter = "";

  constructor(private store: ActivityStore) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getFilter() {
    return this.filter;
  }

  setFilter(next: string) {
    this.filter = next;
    this.refresh();
  }

  getTreeItem(el: ActivityTreeItem) {
    return el;
  }

  getChildren(): vscode.TreeItem[] {
    const all = this.store.getAll();
    const trimmed = this.filter.trim().toLowerCase();
    const items =
      trimmed.length === 0
        ? all
        : all.filter((item) => item.url.toLowerCase().includes(trimmed));

    return items.map((item) => new ActivityTreeItem(item));
  }
}
