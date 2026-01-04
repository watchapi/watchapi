/**
 * WatchAPI VS Code Extension
 * Main entry point
 */

import * as vscode from "vscode";
import { logger, LogLevel } from "@/shared";
import { getConfig } from "@/shared/config";
import { AuthService } from "@/auth";
import {
  CollectionsService,
  CollectionsTreeProvider,
  EndpointNode,
} from "@/collections";
import { EndpointsService } from "@/endpoints";
import { CacheService, SyncService } from "@/sync";
import { StatusBarManager, UploadModal } from "@/ui";
import { hasNextJs, hasTRPC, hasNestJs } from "@/parser";
import { REST_CLIENT } from "@/shared";
import { EndpointsFileSystemProvider } from "./endpoints/endpoints.fs";
import { openEndpointEditor } from "./endpoints/endpoints.editor";
import { OrganizationService } from "@/organizations";
import {
  registerAuthCommands,
  registerCollectionCommands,
  registerEndpointCommands,
  registerNavigationCommands,
  registerOrganizationCommands,
  registerSyncCommands,
  registerUploadCommands,
} from "@/commands";

/**
 * Extension activation
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  logger.info("WatchAPI extension activating");
  logger.setLogLevel(LogLevel.INFO);

  try {
    // Initialize services
    const authService = new AuthService(context);
    const organizationService = new OrganizationService(context);
    const localStorage = new (await import("@/storage")).LocalStorageService(
      context,
    );

    const collectionsService = new CollectionsService();
    const endpointsService = new EndpointsService();

    // Set up local storage for offline mode
    collectionsService.setLocalStorage(localStorage, () =>
      authService.isAuthenticated(),
    );
    endpointsService.setLocalStorage(localStorage, () =>
      authService.isAuthenticated(),
    );

    const cacheService = new CacheService(context);
    const syncService = new SyncService(
      context,
      collectionsService,
      endpointsService,
      cacheService,
    );
    syncService.setLocalStorage(localStorage);

    // Initialize UI components
    const statusBar = new StatusBarManager();
    const uploadModal = new UploadModal(
      collectionsService,
      endpointsService,
      context,
    );

    const fsProvider = new EndpointsFileSystemProvider(endpointsService);

    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider("watchapi", fsProvider, {
        isCaseSensitive: true,
      }),
    );

    // Initialize tree provider
    const treeProvider = new CollectionsTreeProvider(
      collectionsService,
      endpointsService,
      context,
    );

    // Register tree view
    const treeView = vscode.window.createTreeView("watchapi.collections", {
      treeDataProvider: treeProvider,
      canSelectMany: true,
    });

    context.subscriptions.push(
      fsProvider.onDidChangeFile(() => {
        treeProvider.refresh();
      }),
    );

    treeView.onDidChangeSelection(async (event) => {
      const item = event.selection[0];
      if (!item) return;

      // Endpoint click
      if (item instanceof EndpointNode) {
        try {
          await openEndpointEditor(item.endpoint);
          // Show REST Client recommendation if not installed
          checkRestClientExtension();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open endpoint: ${error}`);
        }
      }
    });

    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri: async (uri) => {
          await authService.handleAuthCallback(uri);
        },
      }),
    );

    // Extension works locally by default, sync only when authenticated
    const authState = await authService.getAuthState();
    if (authState.isAuthenticated) {
      await syncService.initialize();
    } else {
      // Load local data when not authenticated
      logger.info("Working in local mode (not authenticated)");
    }

    // Register commands
    registerCommands(
      context,
      authService,
      organizationService,
      collectionsService,
      endpointsService,
      syncService,
      treeProvider,
      uploadModal,
    );

    // Set up event listeners
    setupEventListeners(
      authService,
      organizationService,
      syncService,
      statusBar,
      treeProvider,
    );
    // Initialize auth
    await authService.initialize();

    // Check for supported project types
    await checkProjectType();

    // Add all disposables
    context.subscriptions.push(
      authService,
      organizationService,
      syncService,
      statusBar,
      treeProvider,
      treeView,
    );

    logger.info("WatchAPI extension activated successfully");
    logger.info(`API URL: ${getConfig().apiUrl}`);
  } catch (error) {
    logger.error("Failed to activate extension", error);
    vscode.window.showErrorMessage(`WatchAPI activation failed: ${error}`);
    throw error;
  }
}

/**
 * Register all extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  organizationService: OrganizationService,
  collectionsService: CollectionsService,
  endpointsService: EndpointsService,
  syncService: SyncService,
  treeProvider: CollectionsTreeProvider,
  uploadModal: UploadModal,
): void {
  // Register all command modules
  registerAuthCommands(context, authService, syncService, treeProvider);
  registerOrganizationCommands(
    context,
    authService,
    organizationService,
    syncService,
    treeProvider,
  );
  registerCollectionCommands(context, collectionsService, treeProvider);
  registerEndpointCommands(context, endpointsService, treeProvider);
  registerSyncCommands(context, syncService, treeProvider);
  registerNavigationCommands(context);
  registerUploadCommands(context, uploadModal, treeProvider);

  // Show status command (kept here as it's a simple placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand("watchapi.showStatus", async () => {
      // Implemented in StatusBarManager
    }),
  );
}

/**
 * Set up event listeners
 */
function setupEventListeners(
  authService: AuthService,
  organizationService: OrganizationService,
  syncService: SyncService,
  statusBar: StatusBarManager,
  treeProvider: CollectionsTreeProvider,
): void {
  // Listen to auth state changes
  authService.onDidChangeAuthState(async (state) => {
    statusBar.updateAuthState(state);
    treeProvider.refresh();

    vscode.commands.executeCommand(
      "setContext",
      "watchapi.loggedIn",
      state.isAuthenticated,
    );

    if (state.isAuthenticated) {
      // Fetch and display current organization
      try {
        const organizations = await organizationService.getUserOrganizations();
        const currentOrgId =
          await organizationService.getCurrentOrganizationId();
        const currentOrg = organizations.find((org) => org.id === currentOrgId);

        if (currentOrg) {
          statusBar.updateOrganization(currentOrg.name);
        }
      } catch (error) {
        logger.error("Failed to fetch organization info", error);
      }

      syncService.initialize().catch((error) => {
        vscode.window.showErrorMessage(`Sync failed: ${error}`);
      });
    } else {
      statusBar.updateOrganization(undefined);
      syncService.stopAutoSync();
    }
  });

  // Listen to organization changes
  organizationService.onDidChangeOrganization(async (organizationId) => {
    if (organizationId) {
      try {
        const organizations = await organizationService.getUserOrganizations();
        const org = organizations.find((o) => o.id === organizationId);

        if (org) {
          statusBar.updateOrganization(org.name);
        }
      } catch (error) {
        logger.error("Failed to fetch organization info", error);
      }
    } else {
      statusBar.updateOrganization(undefined);
    }
  });

  // Listen to sync state changes
  syncService.onDidChangeState((state) => {
    statusBar.updateSyncState(state);
  });
}

/**
 * Check and log supported project types
 */
async function checkProjectType(): Promise<void> {
  const [hasNext, hasTrpc, hasNest] = await Promise.all([
    hasNextJs(),
    hasTRPC(),
    hasNestJs(),
  ]);

  const canUpload = hasNext || hasTrpc || hasNest;

  await vscode.commands.executeCommand(
    "setContext",
    "watchapi.canUpload",
    canUpload,
  );

  if (canUpload) {
    const types: string[] = [];
    if (hasNext) types.push("Next.js");
    if (hasTrpc) types.push("tRPC");
    if (hasNest) types.push("NestJS");

    logger.info(`Detected project types: ${types.join(", ")}`);
  } else {
    logger.info(
      "No supported project types detected (upload feature will be disabled)",
    );
  }
}

/**
 * Check if REST Client extension is installed and show info message if not
 * Only shows once per session to avoid annoying the user
 */
let hasShownRestClientInfo = false;
function checkRestClientExtension(): void {
  if (hasShownRestClientInfo) {
    return; // Only show once per session
  }

  const extension = vscode.extensions.getExtension(REST_CLIENT.EXTENSION_ID);
  if (!extension) {
    hasShownRestClientInfo = true;
    vscode.window
      .showInformationMessage(
        `${REST_CLIENT.NAME} is required to run API requests.`,
        `Install ${REST_CLIENT.NAME}`,
        "Cancel",
      )
      .then((action) => {
        if (action === `Install ${REST_CLIENT.NAME}`) {
          vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            REST_CLIENT.EXTENSION_ID,
          );
        }
      });
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  logger.info("WatchAPI extension deactivated");
}
