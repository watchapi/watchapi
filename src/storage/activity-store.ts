// storage/activity-store.ts
import * as vscode from "vscode";
import { ActivityItem } from "../models/activity";

const KEY = "watchapi.activity";

export class ActivityStore {
  constructor(private context: vscode.ExtensionContext) {}

  getAll(): ActivityItem[] {
    return this.context.globalState.get<ActivityItem[]>(KEY, []);
  }

  async add(item: ActivityItem) {
    const items = this.getAll();
    items.unshift(item); // newest first
    await this.context.globalState.update(KEY, items.slice(0, 200));
  }

  async deleteById(id: string) {
    const items = this.getAll().filter((item) => item.id !== id);
    await this.context.globalState.update(KEY, items);
  }

  async clear() {
    await this.context.globalState.update(KEY, []);
  }
}
