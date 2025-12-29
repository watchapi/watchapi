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
    path: endpoint.url,
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

export function humanizeRouteName(route: {
  path: string;
  method: string;
}): string {
  const cleanPath = route.path.replace("{{domain}}", "").trim();

  // ---- tRPC handling -------------------------------------------------
  if (cleanPath.startsWith("/api/trpc")) {
    // /trpc/auth.login -> auth.login
    const procedure = cleanPath.replace("/api/trpc/", "");

    // auth.login -> ["auth", "login"]
    const parts = procedure.split(".").filter(Boolean);

    const namespace = parts.slice(0, -1).join(" ");
    const actionName = parts.at(-1)!;

    const action = inferActionFromProcedure(actionName);

    return [action, capitalize(namespace)].filter(Boolean).join(" ").trim();
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

function inferActionFromProcedure(name: string): string {
  const normalized = name.toLowerCase();

  if (normalized.startsWith("get") || normalized.startsWith("fetch"))
    return "Get";

  if (normalized.startsWith("create") || normalized.startsWith("register"))
    return "Create";

  if (normalized.startsWith("update") || normalized.startsWith("edit"))
    return "Update";

  if (normalized.startsWith("delete") || normalized.startsWith("remove"))
    return "Delete";

  if (
    normalized.includes("login") ||
    normalized.includes("auth") ||
    normalized.includes("verify")
  )
    return "Auth";

  if (normalized.includes("refresh")) return "Refresh";

  return capitalize(name);
}

function capitalize(text: string): string {
  return text
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
