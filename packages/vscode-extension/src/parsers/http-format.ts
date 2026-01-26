/**
 * .http file format parser and constructor
 * Compatible with REST Client extension format
 */

import * as crypto from "crypto";
import {
    ApiEndpoint,
    CreateApiEndpointInput,
    Environment,
    HttpMethod,
    logger,
    ParserError,
    SetDirective,
} from "@/shared";
import { humanizeRouteName } from "@/endpoints/endpoints.editor";

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
        const setDirectives: SetDirective[] = [];
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

            // Extract name from // comment (format: // METHOD path - Name)
            if (line.startsWith("//") && !line.startsWith("// Environments")) {
                if (!name) {
                    name = line.replace(/^\/\/\s*/, "").trim();
                }
                continue;
            }

            // Extract @set directives (@set varName = response.path.to.value)
            const setMatch = line.match(/^@set\s+(\w+)\s*=\s*(.+)$/);
            if (setMatch) {
                setDirectives.push({
                    varName: setMatch[1],
                    responsePath: setMatch[2].trim(),
                });
                continue;
            }

            // Skip other @ directives (file variables)
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

            // Collect multiline URL until headers begin
            if (collectingUrl) {
                if (isHeaderLine(line)) {
                    collectingUrl = false;
                    inHeaders = true;

                    const normalizedUrl = normalizeUrlLines(urlLines);
                    const { path, query } = parseUrlAndQuery(normalizedUrl);

                    requestPath = path;
                    Object.assign(queryParams, query);

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
            headersOverrides:
                Object.keys(headers).length > 0 ? headers : undefined,
            queryOverrides:
                Object.keys(queryParams).length > 0 ? queryParams : undefined,
            bodyOverrides: body.trim() || undefined,
            setDirectivesOverrides:
                setDirectives.length > 0 ? setDirectives : undefined,
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
    _environment?: Record<string, string>,
    options?: { includeAuthorizationHeader?: boolean },
): string {
    try {
        logger.debug(`Constructing .http file for endpoint: ${endpoint.id}`);

        const parts: string[] = [];

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
        // Use headersOverrides if set (user edits), otherwise fall back to headersSchema (code-inferred)
        const effectiveHeaders = {
            ...(endpoint.headersOverrides ?? endpoint.headersSchema),
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
        const effectiveBody = endpoint.bodyOverrides ?? endpoint.bodySchema;
        if (
            effectiveBody &&
            ["POST", "PUT", "PATCH"].includes(endpoint.method)
        ) {
            parts.push(""); // Empty line before body
            parts.push(effectiveBody);
        }

        // Add @set directives at the end if present
        if (
            endpoint.setDirectivesOverrides &&
            endpoint.setDirectivesOverrides.length > 0
        ) {
            parts.push(""); // Empty line before @set directives
            for (const directive of endpoint.setDirectivesOverrides) {
                parts.push(`@set ${directive.varName} = ${directive.responsePath}`);
            }
        }

        const content = parts.join("\n");
        logger.debug("Constructed .http file content", {
            endpointId: endpoint.id,
        });

        return content;
    } catch (error) {
        logger.error("Failed to construct .http file", error);
        throw new ParserError(`Failed to construct .http file: ${error}`);
    }
}

/**
 * Replace environment variables in URL and headers
 * Supports: environment variables, file variables, and system variables
 */
export function replaceEnvironmentVariables(
    text: string,
    environment?: Environment,
    fileVariables?: Record<string, string>,
): string {
    let result = text;

    // Replace system variables first (they take precedence)
    result = replaceSystemVariables(result);

    // Replace file variables (defined with @varName = value)
    if (fileVariables) {
        for (const [key, value] of Object.entries(fileVariables)) {
            const regex = new RegExp(`{{\\s*${escapeRegex(key)}\\s*}}`, "g");
            result = result.replace(regex, value);
        }
    }

    // Replace environment variables
    if (environment && environment.variables.length > 0) {
        for (const variable of environment.variables) {
            if (variable.enabled) {
                const regex = new RegExp(
                    `{{\\s*${escapeRegex(variable.key)}\\s*}}`,
                    "g",
                );
                result = result.replace(regex, variable.value);
            }
        }
    }

    return result;
}

/**
 * Replace system variables: $timestamp, $guid, $randomInt, $processEnv
 */
function replaceSystemVariables(text: string): string {
    return text
        .replace(/\{\{\s*\$timestamp\s*\}\}/g, () =>
            Math.floor(Date.now() / 1000).toString(),
        )
        .replace(/\{\{\s*\$guid\s*\}\}/g, () => crypto.randomUUID())
        .replace(/\{\{\s*\$randomInt\s+(-?\d+)\s+(-?\d+)\s*\}\}/g, (_, min, max) =>
            (Math.floor(Math.random() * (parseInt(max) - parseInt(min))) + parseInt(min)).toString(),
        )
        .replace(/\{\{\s*\$processEnv\s+(\w+)\s*\}\}/g, (_, envVar) =>
            process.env[envVar] ?? "",
        );
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/**
 * Extract file variables from .http file content
 * File variables are defined with @varName = value
 */
export function extractFileVariables(content: string): Record<string, string> {
    const variables: Record<string, string> = {};
    const regex = /^\s*@([^\s=]+)\s*=\s*(.*?)\s*$/gm;
    let match;

    while ((match = regex.exec(content)) !== null) {
        variables[match[1]] = match[2];
    }

    return variables;
}

function formatUrlMultiline(url: string): string {
    const [base, query] = url.split("?", 2);

    if (!query) return url;

    const params = query.split("&");

    return [
        base,
        ...params.map((p, i) => `    ${i === 0 ? "?" : "&"}${p}`),
    ].join("\n");
}

function isHeaderLine(line: string): boolean {
    return /^[A-Za-z-]+:\s*/.test(line);
}

function normalizeUrlLines(lines: string[]): string {
    return lines.join("").replace(/\s+/g, "").trim();
}

function parseUrlAndQuery(url: string): {
    path: string;
    query: Record<string, string>;
} {
    const [path, queryString] = url.split("?", 2);
    const query: Record<string, string> = {};

    if (queryString) {
        for (const part of queryString.split("&")) {
            const [key, value] = part.split("=", 2);
            if (key) {
                query[decodeURIComponent(key)] = value
                    ? decodeURIComponent(value)
                    : "";
            }
        }
    }

    return { path, query };
}

/**
 * Extract @set directives from .http file content
 * Format: @set varName = response.path.to.value
 */
export function extractSetDirectives(content: string): SetDirective[] {
    const directives: SetDirective[] = [];
    const regex = /^\s*@set\s+(\w+)\s*=\s*(.+?)\s*$/gm;
    let match;

    while ((match = regex.exec(content)) !== null) {
        directives.push({
            varName: match[1],
            responsePath: match[2],
        });
    }

    return directives;
}
