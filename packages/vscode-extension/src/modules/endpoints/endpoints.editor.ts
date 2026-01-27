import * as vscode from "vscode";
import { logger } from "@/shared/logger";
import type { ApiEndpoint } from "./endpoints.types";

/**
 * Convert a string to a safe filename slug
 * Removes special characters and replaces spaces with hyphens
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars except spaces and hyphens
    .replace(/[\s_]+/g, "-") // Replace spaces/underscores with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens from start/end
}

/**
 * Build the readable URI for an endpoint
 * Format: watchapi:/{collection}/{name}.http?id={uuid}
 * Or with duplicate index: watchapi:/{collection}/{name}-2.http?id={uuid}
 *
 * The ID is stored in query string (not visible in VS Code tab)
 */
export function buildEndpointUri(
  endpoint: ApiEndpoint,
  collectionName: string,
  duplicateIndex?: number,
): vscode.Uri {
  const collectionSlug = slugify(collectionName) || "default";
  const endpointSlug = slugify(endpoint.name) || endpoint.method.toLowerCase();

  // Add duplicate suffix if needed (e.g., -2, -3)
  const suffix = duplicateIndex && duplicateIndex > 1 ? `-${duplicateIndex}` : "";

  // Format: watchapi:/{collection}/{endpoint}.http?id={uuid}
  const path = `/${collectionSlug}/${endpointSlug}${suffix}.http`;

  return vscode.Uri.parse(`watchapi:${path}?id=${endpoint.id}`);
}

/**
 * Extract endpoint ID from URI query string
 * Returns the ID or null if not found
 */
export function getEndpointIdFromUri(uri: vscode.Uri): string | null {
  const params = new URLSearchParams(uri.query);
  return params.get("id");
}

/**
 * Open endpoint in .http editor
 * @param endpoint - The endpoint to open
 * @param collectionName - Name of the collection (for folder structure)
 * @param duplicateIndex - Index for duplicate names (2, 3, etc.) or undefined for first/unique
 */
export async function openEndpointEditor(
  endpoint: ApiEndpoint,
  collectionName: string = "Endpoints",
  duplicateIndex?: number,
): Promise<void> {
  logger.debug("Opening endpoint editor", {
    endpointId: endpoint.id,
    method: endpoint.method,
    path: endpoint.requestPath,
  });
  try {
    const uri = buildEndpointUri(endpoint, collectionName, duplicateIndex);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });

    logger.info("Opened endpoint editor", {
      endpointId: endpoint.id,
      uri: uri.toString(),
    });
  } catch (error) {
    logger.error("Failed to open endpoint editor", {
      endpointId: endpoint.id,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Convert camelCase to Title Case
 * Examples:
 * - getAnalytics -> Get Analytics
 * - checkEndpoint -> Check Endpoint
 * - sendRequest -> Send Request
 */
function humanizeCamelCase(text: string): string {
  // Insert space before uppercase letters
  const spaced = text.replace(/([A-Z])/g, " $1");
  // Capitalize first letter and trim
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
}

export function humanizeRouteName(route: {
  path: string;
  method: string;
}): string {
  const cleanPath = route.path.replace("{{baseUrl}}", "").trim();

  // ---- tRPC handling -------------------------------------------------
  if (cleanPath.startsWith("/api/trpc")) {
    // /trpc/auth.login -> auth.login
    const procedure = cleanPath.replace("/api/trpc/", "");

    // auth.login -> ["auth", "login"]
    const parts = procedure.split(".").filter(Boolean);

    const actionName = parts.at(-1)!;

    // Convert camelCase to Title Case (e.g., getAnalytics -> Get Analytics)
    const humanized = humanizeCamelCase(actionName);

    return humanized;
  }

  // ---- REST handling -------------------------------------------------
  const parts = cleanPath
    .split("/")
    .filter(Boolean)
    .filter((p) => p !== "api");

  const resource = parts.slice(-2).join(" ");

  const actionMap: Record<string, string> = {
    GET: "Get",
    POST: "Create",
    PUT: "Update",
    PATCH: "Update",
    DELETE: "Delete",
  };

  const action = actionMap[route.method.toUpperCase()] ?? "Handle";

  return `${action} ${capitalize(resource)}`.trim();
}

function capitalize(text: string): string {
  return text
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
