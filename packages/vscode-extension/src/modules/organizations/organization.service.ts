/**
 * Organization service
 * Handles organization state and switching
 */

import * as vscode from "vscode";
import { trpc } from "@/infrastructure/api/trpc-client";
import { STORAGE_KEYS } from "@/shared/constants";
import { logger } from "@/shared/logger";
import type { UserOrganization } from "./organization.types";

export class OrganizationService {
  private context: vscode.ExtensionContext;
  private _onDidChangeOrganization = new vscode.EventEmitter<
    string | undefined
  >();
  public readonly onDidChangeOrganization = this._onDidChangeOrganization.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get the currently selected organization ID
   */
  async getCurrentOrganizationId(): Promise<string | undefined> {
    return this.context.globalState.get<string>(STORAGE_KEYS.SELECTED_ORG_ID);
  }

  /**
   * Set the currently selected organization ID
   */
  async setCurrentOrganizationId(
    organizationId: string | undefined,
  ): Promise<void> {
    await this.context.globalState.update(
      STORAGE_KEYS.SELECTED_ORG_ID,
      organizationId,
    );
    this._onDidChangeOrganization.fire(organizationId);
  }

  /**
   * Get all organizations for the current user
   * Fetches from backend API
   */
  async getUserOrganizations(): Promise<UserOrganization[]> {
    try {
      // Fetch organizations directly from backend
      const organizations = await trpc.getMyOrganizations();

      if (!organizations || organizations.length === 0) {
        logger.warn("No organizations found for user");
        return [];
      }

      return organizations as UserOrganization[];
    } catch (error) {
      logger.error("Failed to fetch user organizations", error);
      throw error;
    }
  }

  /**
   * Switch to a different organization
   * This generates a new JWT with the selected organization
   */
  async switchOrganization(organizationId: string): Promise<void> {
    try {
      logger.info(`Switching to organization: ${organizationId}`);

      // Call backend to switch organization and get new tokens
      const tokens = await trpc.switchOrganization({ organizationId });

      // Update stored token
      await this.context.secrets.store(
        STORAGE_KEYS.JWT_TOKEN,
        tokens.accessToken,
      );

      if (tokens.refreshToken) {
        await this.context.secrets.store(
          STORAGE_KEYS.REFRESH_TOKEN,
          tokens.refreshToken,
        );
      }

      // Update current organization
      await this.setCurrentOrganizationId(organizationId);

      logger.info("Organization switched successfully");
    } catch (error) {
      logger.error("Failed to switch organization", error);
      throw error;
    }
  }

  /**
   * Clear organization selection
   */
  async clearOrganization(): Promise<void> {
    await this.setCurrentOrganizationId(undefined);
  }

  /**
   * Get organization quick pick items for UI
   * @returns Array of VS Code QuickPick items
   */
  async getOrganizationPickItems(): Promise<OrganizationQuickPickItem[]> {
    const organizations = await this.getUserOrganizations();
    const currentOrgId = await this.getCurrentOrganizationId();

    return organizations.map((org) => ({
      label: org.name,
      description: `${org.role} • ${org.plan}`,
      detail: currentOrgId === org.id ? "Currently selected" : undefined,
      organizationId: org.id,
      organization: org,
    }));
  }

  /**
   * Present organization picker and switch with sync
   * Combines UI interaction, org switching, and sync in one flow
   *
   * @param authService - Auth service to check authentication
   * @param syncService - Sync service to trigger post-switch sync
   * @returns The selected organization, or undefined if cancelled
   */
  async switchOrganizationInteractive(
    authService: { isAuthenticated: () => Promise<boolean> },
    syncService: { sync: () => Promise<void> },
  ): Promise<UserOrganization | undefined> {
    // Check authentication
    const isAuthenticated = await authService.isAuthenticated();
    if (!isAuthenticated) {
      vscode.window.showErrorMessage("Please login first");
      return undefined;
    }

    // Fetch user's organizations
    const organizations = await this.getUserOrganizations();

    if (!organizations || organizations.length === 0) {
      vscode.window.showInformationMessage("No organizations found");
      return undefined;
    }

    // Get current organization
    const currentOrgId = await this.getCurrentOrganizationId();

    // Show quick pick
    const items = await this.getOrganizationPickItems();

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select an organization",
      title: "Switch Organization",
    });

    if (!selected) {
      return undefined;
    }

    // Don't switch if already on this organization
    if (selected.organizationId === currentOrgId) {
      return selected.organization;
    }

    // Switch organization with progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Switching to ${selected.label}...`,
        cancellable: false,
      },
      async () => {
        await this.switchOrganization(selected.organizationId);

        // Refresh collections after switching
        await syncService.sync();
      },
    );

    return selected.organization;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeOrganization.dispose();
  }
}

export interface OrganizationQuickPickItem extends vscode.QuickPickItem {
  organizationId: string;
  organization: UserOrganization;
}
