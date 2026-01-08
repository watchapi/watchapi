import * as vscode from "vscode";
import { logger } from "@/shared/logger";
import type { ApiEndpoint, ParsedRoute } from "@/shared/types";

/**
 * Open endpoint in .http editor
 */
export async function openEndpointEditor(endpoint: ApiEndpoint): Promise<void> {
  logger.debug("Opening endpoint editor", {
    endpointId: endpoint.id,
    method: endpoint.method,
    path: endpoint.requestPath,
  });
  try {
    const uri = vscode.Uri.parse(`watchapi:/endpoints/${endpoint.id}.http`);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });

    logger.info("Opened endpoint editor", { endpointId: endpoint.id });
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
