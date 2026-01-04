/**
 * .http file format parser and constructor
 * Compatible with REST Client extension format
 */

import { logger } from "@/shared/logger";
import { ParserError } from "@/shared/errors";
import type {
  ApiEndpoint,
  Environment,
  CreateApiEndpointInput,
} from "@/shared/types";
import type { HttpMethod } from "@/shared/constants";
import { humanizeRouteName } from "@/endpoints/endpoints.editor";
import { flatten } from "flat";

/**
 * Parse .http file content to endpoint data
 */
export function parseHttpFile(
  content: string,
): Partial<CreateApiEndpointInput> {
  try {
    logger.debug("Parsing .http file content");

    const lines = content.split("\n");
    let method: HttpMethod = "GET";
    let url = "";
    let name = "";
    const headers: Record<string, string> = {};
    let body = "";
    let inBody = false;
    let inHeaders = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (line.length === 0) {
        // Empty line after headers indicates body start
        if (inHeaders && i < lines.length - 1) {
          inHeaders = false;
          inBody = true;
        }
        continue;
      }

      // Skip regular comments
      if (line.startsWith("#") && !line.startsWith("###")) {
        continue;
      }

      if (line.startsWith("//")) {
        continue;
      }

      // Extract name from ### comment (format: ### METHOD path - Name)
      if (line.startsWith("###")) {
        const commentContent = line.replace(/^###\s*/, "").trim();

        // Try to extract name from format: "METHOD path - Name"
        // The name is everything after the last " - "
        const dashIndex = commentContent.lastIndexOf(" - ");
        if (dashIndex !== -1) {
          name = commentContent.substring(dashIndex + 3).trim();
        } else {
          // Fallback: use the entire comment as name
          name = commentContent;
        }
        continue;
      }

      // Skip environment variables section
      if (line.startsWith("@")) {
        continue;
      }

      // Parse request line (METHOD URL)
      if (
        !inHeaders &&
        !inBody &&
        line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i)
      ) {
        const parts = line.split(/\s+/);
        method = parts[0].toUpperCase() as HttpMethod;
        url = parts[1] || "";
        inHeaders = true;
        continue;
      }

      // Parse headers
      if (inHeaders && line.includes(":")) {
        const colonIndex = line.indexOf(":");
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
        continue;
      }

      // Collect body lines
      if (inBody) {
        body += (body ? "\n" : "") + lines[i];
      }
    }

    // Generate name if not found in comments
    if (!name) {
      name = humanizeRouteName({
        path: url,
        method,
      });
    }

    const endpoint: Partial<CreateApiEndpointInput> = {
      name,
      method,
      url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body.trim() || undefined,
    };

    logger.debug("Parsed endpoint from .http file", endpoint);
    return endpoint;
  } catch (error) {
    logger.error("Failed to parse .http file", error);
    throw new ParserError(`Failed to parse .http file: ${error}`);
  }
}

/**
 * Construct .http file content from endpoint data
 */
export function constructHttpFile(
  endpoint: ApiEndpoint,
  environment?: Record<string, string>,
  options?: { includeAuthorizationHeader?: boolean },
): string {
  try {
    logger.debug(`Constructing .http file for endpoint: ${endpoint.id}`);

    const parts: string[] = [];

    // Add environment variables section if environment provided
    if (environment?.local) {
      parts.push("### Environments – rest-client.env.json");

      const flatEnv = flatten(environment.local, {
        delimiter: ".",
        safe: true,
      }) as Record<string, unknown>;

      for (const [key, value] of Object.entries(flatEnv)) {
        if (value !== undefined && value !== null && value !== "") {
          const formatted =
            typeof value === "string" && value.includes(" ")
              ? `"${value}"`
              : value;

          parts.push(`@${key} = ${formatted}`);
        }
      }

      parts.push("");
    }

    // Add endpoint name as comment
    parts.push(`### ${endpoint.name}`);

    // Add request line
    const requestLine = `${endpoint.method} ${endpoint.url}`;
    parts.push(requestLine);

    // Prepare headers - include Authorization if setting enabled and not already present
    const headers = { ...endpoint.headers };
    const includeAuth = options?.includeAuthorizationHeader ?? true;

    if (includeAuth && !headers.Authorization && !headers.authorization) {
      headers.Authorization = "Bearer {{authToken}}";
    }

    // Add headers
    if (Object.keys(headers).length > 0) {
      for (const [key, value] of Object.entries(headers)) {
        parts.push(`${key}: ${value}`);
      }
    }

    // Add body if present (for POST, PUT, PATCH)
    if (endpoint.body && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
      parts.push(""); // Empty line before body
      parts.push(endpoint.body);
    }

    const content = parts.join("\n");
    logger.debug("Constructed .http file content", { endpointId: endpoint.id });

    return content;
  } catch (error) {
    logger.error("Failed to construct .http file", error);
    throw new ParserError(`Failed to construct .http file: ${error}`);
  }
}

/**
 * Replace environment variables in URL and headers
 */
export function replaceEnvironmentVariables(
  text: string,
  environment?: Environment,
): string {
  if (!environment || environment.variables.length === 0) {
    return text;
  }

  let result = text;

  for (const variable of environment.variables) {
    if (variable.enabled) {
      // Replace {{variableName}} format
      const regex = new RegExp(`{{${variable.key}}}`, "g");
      result = result.replace(regex, variable.value);
    }
  }

  return result;
}

/**
 * Extract environment variable references from text
 */
export function extractVariableReferences(text: string): string[] {
  const regex = /{{([^}]+)}}/g;
  const matches = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return [...new Set(matches)]; // Remove duplicates
}
