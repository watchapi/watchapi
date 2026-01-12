/**
 * Export command handlers
 * Commands: EXPORT
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand } from "./command-wrapper";
import type { CollectionsService } from "@/collections";
import type { EndpointsService } from "@/endpoints";
import type { ApiEndpoint, Collection } from "@/shared/types";

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
          await exportCollections(collectionsService, endpointsService);
        },
      ),
    ),
  );
}

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

  // Export each collection
  let totalEndpoints = 0;
  for (const collection of collections) {
    const endpoints = await endpointsService.getByCollectionId(collection.id);

    if (endpoints.length > 0) {
      await exportCollection(exportDir, collection, endpoints);
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
): Promise<void> {
  // Sanitize collection name for filesystem
  const collectionDirName = sanitizeFilename(collection.name);
  const collectionDir = path.join(exportDir, collectionDirName);

  // Create collection directory
  await fs.mkdir(collectionDir, { recursive: true });

  // Create .http file for each endpoint
  for (const endpoint of endpoints) {
    const httpContent = generateHttpFileContent(endpoint);
    const filename = sanitizeFilename(`${endpoint.name}.http`);
    const filePath = path.join(collectionDir, filename);

    await fs.writeFile(filePath, httpContent, "utf-8");
  }
}

/**
 * Generate .http file content for an endpoint
 */
function generateHttpFileContent(endpoint: ApiEndpoint): string {
  const lines: string[] = [];

  // Add comment with endpoint name
  lines.push(`### ${endpoint.name}`);
  lines.push("");

  // Add HTTP method and URL
  const url = endpoint.requestPath.startsWith("http")
    ? endpoint.requestPath
    : `{{baseUrl}}${endpoint.requestPath}`;
  lines.push(`${endpoint.method} ${url}`);

  // Add headers (merge schema and overrides)
  const headers = mergeHeaders(endpoint);
  if (Object.keys(headers).length > 0) {
    for (const [key, value] of Object.entries(headers)) {
      lines.push(`${key}: ${value}`);
    }
  }

  // Add body if present
  const body = getEffectiveBody(endpoint);
  if (body) {
    lines.push("");
    lines.push(body);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Merge headers schema and overrides
 */
function mergeHeaders(endpoint: ApiEndpoint): Record<string, string> {
  const headers: Record<string, string> = {};

  // Start with schema headers
  if (endpoint.headersSchema) {
    Object.assign(headers, endpoint.headersSchema);
  }

  // Apply overrides
  if (endpoint.headersOverrides) {
    Object.assign(headers, endpoint.headersOverrides);
  }

  // Fallback to deprecated headers field
  if (
    !endpoint.headersSchema &&
    !endpoint.headersOverrides &&
    endpoint.headers
  ) {
    Object.assign(headers, endpoint.headers);
  }

  return headers;
}

/**
 * Get effective body (overrides take precedence over schema)
 */
function getEffectiveBody(endpoint: ApiEndpoint): string | undefined {
  if (endpoint.bodyOverrides) {
    return endpoint.bodyOverrides;
  }

  if (endpoint.bodySchema) {
    return endpoint.bodySchema;
  }

  // Fallback to deprecated body field
  if (endpoint.body) {
    return endpoint.body;
  }

  return undefined;
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
