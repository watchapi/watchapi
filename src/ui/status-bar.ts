/**
 * Status bar management
 * Shows sync status and auth state
 */

import * as vscode from "vscode";
import { logger } from "@/shared/logger";
import type { SyncState } from "@/shared/types";
import type { AuthState } from "@/auth/auth.types";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private syncState: SyncState = { isSyncing: false };
  private authState: AuthState = { isAuthenticated: false };
  private organizationName?: string;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.update();
    this.statusBarItem.show();
  }

  /**
   * Update sync state
   */
  updateSyncState(state: SyncState): void {
    this.syncState = state;
    this.update();
  }

  /**
   * Update auth state
   */
  updateAuthState(state: AuthState): void {
    this.authState = state;
    this.update();
  }

  /**
   * Update organization name
   */
  updateOrganization(name?: string): void {
    this.organizationName = name;
    this.update();
  }

  /**
   * Update status bar display
   */
  private update(): void {
    const parts: string[] = [];

    // Auth status
    if (this.authState.isAuthenticated && this.authState.user) {
      const orgName = this.organizationName || "WatchAPI";
      parts.push(`$(cloud) ${orgName}`);
      this.statusBarItem.command = "watchapi.showStatus";
      this.statusBarItem.backgroundColor = undefined;
    } else {
      parts.push("$(database) Local");
      this.statusBarItem.command = "watchapi.login";
      this.statusBarItem.backgroundColor = undefined;
    }

    // Sync status (only show when authenticated)
    if (this.authState.isAuthenticated) {
      if (this.syncState.isSyncing) {
        parts.push("$(sync~spin)");
      } else if (this.syncState.error) {
        parts.push("$(error)");
      } else if (this.syncState.lastSyncTime) {
        parts.push("$(check)");
      }
    }

    this.statusBarItem.text = parts.join(" ");

    // Update tooltip
    this.updateTooltip();
  }

  /**
   * Update tooltip
   */
  private updateTooltip(): void {
    const tooltip = new vscode.MarkdownString();

    // Auth info
    if (this.authState.isAuthenticated && this.authState.user) {
      tooltip.appendMarkdown("**Cloud Mode** ☁️\n\n");
      tooltip.appendMarkdown(
        `Signed in as **${this.authState.user.email}**\n\n`,
      );

      // Organization info
      if (this.organizationName) {
        tooltip.appendMarkdown(
          `Organization: **${this.organizationName}**\n\n`,
        );
      }

      // Sync info (only when authenticated)
      if (this.syncState.isSyncing) {
        tooltip.appendMarkdown("⏳ Syncing with cloud...\n");
      } else if (this.syncState.error) {
        tooltip.appendMarkdown(`❌ Sync error: ${this.syncState.error}\n`);
      } else if (this.syncState.lastSyncTime) {
        const date = new Date(this.syncState.lastSyncTime);
        tooltip.appendMarkdown(
          `✅ Last synced: ${date.toLocaleTimeString()}\n`,
        );
      }

      tooltip.appendMarkdown("\nClick to view status details");
    } else {
      tooltip.appendMarkdown("**WatchAPI Local Mode**\n\n");
      tooltip.appendMarkdown("Your data is stored locally on this device\n\n");
      tooltip.appendMarkdown("**Click to sign in** and sync with cloud");
    }

    this.statusBarItem.tooltip = tooltip;
  }

  /**
   * Get human-readable time since timestamp
   */
  private getTimeSince(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) {
      return "just now";
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /**
   * Show status details
   */
  async showStatusDetails(): Promise<void> {
    const items: vscode.QuickPickItem[] = [];

    // Auth info
    if (this.authState.isAuthenticated && this.authState.user) {
      items.push({
        label: "$(account) Authentication",
        description: `Logged in as ${this.authState.user.email}`,
      });
    } else {
      items.push({
        label: "$(account) Authentication",
        description: "Not logged in",
      });
    }

    // Sync info
    if (this.syncState.lastSyncTime) {
      const date = new Date(this.syncState.lastSyncTime);
      items.push({
        label: "$(sync) Last Sync",
        description: date.toLocaleString(),
      });
    }

    if (this.syncState.error) {
      items.push({
        label: "$(error) Sync Error",
        description: this.syncState.error,
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: "WatchAPI Status",
    });

    if (selected) {
      logger.info("Status details shown", { selected });
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
