/**
 * .http file format parser and constructor
 * Compatible with REST Client extension format
 */

import { logger } from "./lib/logger";
import { ParserError } from "./lib/errors";
import type {
  ApiEndpoint,
  Environment,
  CreateApiEndpointInput,
} from "./lib/types";
import type { HttpMethod } from "./lib/constants";
import { humanizeRouteName } from "./lib/utils";
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
    let requestPath = "";
    let name = "";
    const headers: Record<string, string> = {};
    const queryParams: Record<string, string> = {};
    let body = "";
    let inBody = false;
    let inHeaders = false;
    let collectingUrl = false;
    let urlLines: string[] = [];

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
      if (line.startsWith("#") && !line.startsWith("//")) {
        continue;
      }

      if (line.startsWith("//")) {
        continue;
      }

      // Extract name from // comment (format: // METHOD path - Name)
      if (line.startsWith("//")) {
        const commentContent = line.replace(/^\/\/\s*/, "").trim();

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
        const [, rawUrl = ""] = line.split(/\s+/, 2);

        method = line.split(/\s+/)[0].toUpperCase() as HttpMethod;
        urlLines = [rawUrl];
        collectingUrl = true;
        continue;
      }

      // Collect multiline URL (until headers start)
      if (collectingUrl) {
        // Headers start → stop URL collection
        if (/^[A-Za-z-]+:\s*/.test(line)) {
          collectingUrl = false;
          inHeaders = true;

          const fullUrl = urlLines
            .join("")
            .replace(/\s+/g, "") // remove line breaks + indentation
            .trim();

          // Extract query params from URL
          const [basePath, queryString] = fullUrl.split("?");
          requestPath = basePath;

          if (queryString) {
            // Parse query string into params object
            queryString.split("&").forEach((param) => {
              const [key, value] = param.split("=");
              if (key) {
                queryParams[decodeURIComponent(key)] = value
                  ? decodeURIComponent(value)
                  : "";
              }
            });
          }

          // fall through to header parsing
        } else {
          urlLines.push(line.trim());
          continue;
        }
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
        path: requestPath,
        method,
      });
    }

    const endpoint: Partial<CreateApiEndpointInput> = {
      name,
      method,
      pathTemplate: requestPath, // When parsing .http file, use the URL as template initially
      requestPath,
      headersOverrides: Object.keys(headers).length > 0 ? headers : undefined,
      queryOverrides:
        Object.keys(queryParams).length > 0 ? queryParams : undefined,
      bodyOverrides: body.trim() || undefined,
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
      parts.push("// Environments – rest-client.env.json");

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
    parts.push(`// ${endpoint.name}`);

    // Prepare query params - use layered schema pattern
    // Use queryOverrides if set (user edits), otherwise fall back to querySchema (code-inferred)
    const effectiveQuery = {
      ...(endpoint.querySchema ?? {}),
      ...(endpoint.queryOverrides ?? {}),
    };

    // Build full URL with query params
    let fullUrl = endpoint.requestPath;
    if (Object.keys(effectiveQuery).length > 0) {
      const queryString = Object.entries(effectiveQuery)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join("&");
      fullUrl = `${endpoint.requestPath}?${queryString}`;
    }

    // Add request line
    const formattedUrl = formatUrlMultiline(fullUrl);
    const requestLine = `${endpoint.method} ${formattedUrl}`;

    parts.push(requestLine);
    // Prepare headers - use layered schema pattern
    // Use headersOverrides if set (user edits), otherwise fall back to headersSchema (code-inferred) or headers (legacy)
    const effectiveHeaders = {
      ...(endpoint.headersOverrides ??
        endpoint.headersSchema ??
        endpoint.headers),
    };
    const includeAuth = options?.includeAuthorizationHeader ?? true;

    if (
      includeAuth &&
      !effectiveHeaders.Authorization &&
      !effectiveHeaders.authorization
    ) {
      effectiveHeaders.Authorization = "Bearer {{authToken}}";
    }

    // Add headers
    if (Object.keys(effectiveHeaders).length > 0) {
      for (const [key, value] of Object.entries(effectiveHeaders)) {
        parts.push(`${key}: ${value}`);
      }
    }

    // Add body if present (for POST, PUT, PATCH)
    // Use bodyOverrides if set (user edits), otherwise fall back to bodySchema (code-inferred)
    const effectiveBody =
      endpoint.bodyOverrides ?? endpoint.bodySchema ?? endpoint.body;
    if (effectiveBody && ["POST", "PUT", "PATCH"].includes(endpoint.method)) {
      parts.push(""); // Empty line before body
      parts.push(effectiveBody);
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

function formatUrlMultiline(url: string): string {
  const [base, query] = url.split("?", 2);

  if (!query) return url;

  const params = query.split("&");

  return [base, ...params.map((p, i) => `    ${i === 0 ? "?" : "&"}${p}`)].join(
    "\n",
  );
}
