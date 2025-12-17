import * as vscode from "vscode";
import { ActivityItem } from "../models/activity";

export class ActivityTreeItem extends vscode.TreeItem {
  constructor(public readonly activity: ActivityItem) {
    super(labelFor(activity), vscode.TreeItemCollapsibleState.None);

    this.description = timeAgo(activity.timestamp);
    this.contextValue = "activityItem";

    this.iconPath = methodIcon(activity.method);

    this.command = {
      command: "watchapi.activity.open",
      title: "Open Request",
      arguments: [activity],
    };

    this.tooltip = `${activity.method} ${activity.url}`;
  }
}

function methodIcon(method: string) {
  return new vscode.ThemeIcon(
    method === "GET" ? "arrow-right" : "cloud-upload",
  );
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) {
    return "just now";
  }
  if (sec < 60) {
    return `${sec} sec ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min} min ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return `${hr} hours ago`;
  }
  const days = Math.floor(hr / 24);
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

function labelFor(activity: ActivityItem) {
  // Native TreeView doesn't support "pill" badges; prefix keeps it readable.
  return `${activity.method} ${displayUrl(activity.url)}`;
}

function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
