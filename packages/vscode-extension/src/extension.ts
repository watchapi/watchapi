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
import { detectRoutes, hasAnyProjectType } from "@watchapi/parsers";
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
    registerExportCommands,
} from "@/commands";
import { ExecutionButton } from "./ui/execute-request/execution-button";
import { HttpFileCodeLensProvider } from "./ui/execute-request/code-lens-provider";
import {
    getResponseDocumentProvider,
    RESPONSE_DOCUMENT_SCHEME,
} from "./ui/execute-request/response-document-provider";
import { HttpVariableHoverProvider } from "./ui/execute-request/variable-hover-provider";

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
        const localStorage = new (
            await import("../src/storage/index.js")
        ).LocalStorageService(context);

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
            vscode.workspace.registerFileSystemProvider(
                "watchapi",
                fsProvider,
                {
                    isCaseSensitive: true,
                },
            ),
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
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to open endpoint: ${error}`,
                    );
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
    registerExportCommands(context, collectionsService, endpointsService);

    // Show status command (kept here as it's a simple placeholder)
    context.subscriptions.push(
        vscode.commands.registerCommand("watchapi.showStatus", async () => {
            // Implemented in StatusBarManager
        }),
    );

    const codeLensProvider = new HttpFileCodeLensProvider();
    const hoverProvider = new HttpVariableHoverProvider();

    const selectors: vscode.DocumentSelector = [{ language: "http" }];

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(selectors, codeLensProvider),
        vscode.languages.registerHoverProvider(selectors, hoverProvider),
    );

    const responseProvider = getResponseDocumentProvider();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            RESPONSE_DOCUMENT_SCHEME,
            responseProvider,
        ),
    );

    const executionButton = new ExecutionButton();
    executionButton.registerCommand(context);
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
                const organizations =
                    await organizationService.getUserOrganizations();
                const currentOrgId =
                    await organizationService.getCurrentOrganizationId();
                const currentOrg = organizations.find(
                    (org) => org.id === currentOrgId,
                );

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
                const organizations =
                    await organizationService.getUserOrganizations();
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
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        await vscode.commands.executeCommand(
            "setContext",
            "watchapi.canUpload",
            false,
        );
        return;
    }

    const rootDir = workspaceFolders[0].uri.fsPath;
    const parserLogger = logger.createParserLogger();
    const detected = await detectRoutes(rootDir, { logger: parserLogger });
    const canUpload = hasAnyProjectType(detected);

    await vscode.commands.executeCommand(
        "setContext",
        "watchapi.canUpload",
        canUpload,
    );

    if (canUpload) {
        const types: string[] = [];
        if (detected.nextApp) types.push("Next.js (App router)");
        if (detected.nextPages) types.push("Next.js (Pages router)");
        if (detected.trpc) types.push("tRPC");
        if (detected.nestjs) types.push("NestJS");
        if (detected.payloadCMS) types.push("Payload CMS");

        logger.info(`Detected project types: ${types.join(", ")}`);
    } else {
        logger.info(
            "No supported project types detected (upload feature will be disabled)",
        );
    }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    logger.info("WatchAPI extension deactivated");
}
