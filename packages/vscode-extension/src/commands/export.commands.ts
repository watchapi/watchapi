/**
 * Export command handlers
 * Commands: EXPORT
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { COMMANDS } from "@/shared/constants";
import { readRestClientEnvFile } from "@/environments";
import { wrapCommand } from "./command-wrapper";
import type { CollectionsService } from "@/collections";
import type { EndpointsService } from "@/endpoints";
import type { ApiEndpoint, Collection } from "@/shared/types";
import { constructHttpFile } from "@/parsers";

/**
 * Register export commands
 */
export function registerExportCommands(
    context: vscode.ExtensionContext,
    collectionsService: CollectionsService,
    endpointsService: EndpointsService,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.EXPORT,
            wrapCommand(
                {
                    commandName: "export",
                    errorMessagePrefix: "Failed to export collections",
                    showSuccessMessage: true,
                    successMessage: "Collections exported successfully",
                },
                async () => {
                    await exportCollections(
                        collectionsService,
                        endpointsService,
                    );
                },
            ),
        ),
    );
}

/**
 * Read REST client environment from workspace
 */
/**
 * Export all collections to .http files
 */
async function exportCollections(
    collectionsService: CollectionsService,
    endpointsService: EndpointsService,
): Promise<void> {
    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder found");
    }

    // Create export directory
    const exportDir = path.join(workspaceFolder.uri.fsPath, "watchapi-export");
    await fs.mkdir(exportDir, { recursive: true });

    // Get all collections
    const collections = await collectionsService.getAll();

    if (collections.length === 0) {
        vscode.window.showInformationMessage("No collections to export");
        return;
    }

    // Read environment and settings
    const env = await readRestClientEnvFile(workspaceFolder);
    const config = vscode.workspace.getConfiguration("watchapi");
    const includeAuthorizationHeader = config.get<boolean>(
        "includeAuthorizationHeader",
        true,
    );

    // Export each collection
    let totalEndpoints = 0;
    for (const collection of collections) {
        const endpoints = await endpointsService.getByCollectionId(
            collection.id,
        );

        if (endpoints.length > 0) {
            await exportCollection(exportDir, collection, endpoints, env, {
                includeAuthorizationHeader,
            });
            totalEndpoints += endpoints.length;
        }
    }

    vscode.window.showInformationMessage(
        `Exported ${collections.length} collection(s) with ${totalEndpoints} endpoint(s) to watchapi-export`,
    );
}

/**
 * Export a single collection with its endpoints
 */
async function exportCollection(
    exportDir: string,
    collection: Collection,
    endpoints: ApiEndpoint[],
    env: Record<string, string>,
    options: { includeAuthorizationHeader: boolean },
): Promise<void> {
    // Sanitize collection name for filesystem
    const collectionDirName = sanitizeFilename(collection.name);
    const collectionDir = path.join(exportDir, collectionDirName);

    // Create collection directory
    await fs.mkdir(collectionDir, { recursive: true });

    // Create .http file for each endpoint
    for (const endpoint of endpoints) {
        const httpContent = constructHttpFile(endpoint, env, options);
        const filename = sanitizeFilename(`${endpoint.name}.http`);
        const filePath = path.join(collectionDir, filename);

        await fs.writeFile(filePath, httpContent, "utf-8");
    }
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(filename: string): string {
    // Replace invalid characters with underscores
    return filename
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim();
}
