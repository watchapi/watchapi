/**
 * Response variable handler for @set directives
 * Extracts values from HTTP responses and persists them to rest-client.env.json
 */

import * as vscode from "vscode";
import { logger } from "@/shared";
import type { SetDirective } from "../endpoints.types";
import { updateEnvFileVariables } from "@/modules/environments";
import { ResponseHeaders } from "@/shared/base";

export interface ResponseData {
    body: string;
    headers: ResponseHeaders;
}

/**
 * Extract a value from response body or headers using a dot-notation path
 * Supports paths like:
 * - response.data.token, response.user.id (JSON body)
 * - response.headers.set-cookie, headers.authorization (headers)
 * - response.cookies.session_id (individual cookie value from set-cookie)
 * - response.items[0].name (array access in body)
 */
export function extractValueFromResponse(
    response: ResponseData,
    path: string,
): string | undefined {
    try {
        // Remove 'response.' prefix if present
        let cleanPath = path.startsWith("response.")
            ? path.slice("response.".length)
            : path;

        // Check if extracting a specific cookie value
        if (cleanPath.startsWith("cookies.")) {
            const cookieName = cleanPath.slice("cookies.".length);
            return extractCookieValue(response.headers, cookieName);
        }

        // Check if extracting from headers
        if (cleanPath.startsWith("headers.")) {
            const headerName = cleanPath.slice("headers.".length).toLowerCase();
            return extractFromHeaders(response.headers, headerName);
        }

        if (cleanPath.startsWith("body.")) {
            cleanPath = cleanPath.slice("body.".length);
        }

        if (cleanPath.startsWith("data.")) {
            cleanPath = cleanPath.slice("data.".length);
        }

        const parsed = JSON.parse(response.body);
        const value = getNestedValue(parsed, cleanPath);

        if (value === undefined || value === null) {
            return undefined;
        }

        // Convert to string
        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        return String(value);
    } catch (error) {
        logger.debug(
            `Failed to extract value from response for path "${path}":`,
            error,
        );
        return undefined;
    }
}

/**
 * Extract a value from response headers
 * Handles set-cookie which can be an array
 */
function extractFromHeaders(
    headers: ResponseHeaders,
    headerName: string,
): string | undefined {
    const value = headers[headerName];

    if (value === undefined || value === null) {
        return undefined;
    }

    // set-cookie is an array, join with semicolon for multiple cookies
    if (Array.isArray(value)) {
        return value.join("; ");
    }

    // Handle number type (e.g., content-length)
    if (typeof value === "number") {
        return String(value);
    }

    return value;
}

/**
 * Extract a specific cookie value from set-cookie headers
 * Parses "cookie_name=cookie_value; attributes..." format
 */
function extractCookieValue(
    headers: ResponseHeaders,
    cookieName: string,
): string | undefined {
    const setCookieHeader = headers["set-cookie"];

    if (!setCookieHeader) {
        return undefined;
    }

    // set-cookie is always an array in Node.js http
    const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];

    for (const cookie of cookies) {
        // Parse "name=value; attributes..."
        const [nameValue] = cookie.split(";", 1);
        const eqIndex = nameValue.indexOf("=");

        if (eqIndex === -1) continue;

        const name = nameValue.slice(0, eqIndex).trim();
        const value = nameValue.slice(eqIndex + 1).trim();

        if (name === cookieName) {
            return value;
        }
    }

    return undefined;
}

/**
 * Get a nested value from an object using dot notation with array support
 * Examples: "data.token", "user.id", "items[0].name", "results.0.value"
 */
function getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        if (typeof current !== "object") {
            return undefined;
        }

        // Handle array index (numeric part)
        const index = parseInt(part, 10);
        if (!isNaN(index) && Array.isArray(current)) {
            current = current[index];
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }

    return current;
}

/**
 * Process @set directives after a successful request execution
 * Extracts values from the response body or headers and persists them to the environment file
 */
export async function processSetDirectives(
    directives: SetDirective[],
    response: ResponseData,
    workspaceFolder: vscode.WorkspaceFolder,
): Promise<Record<string, string>> {
    const extractedVariables: Record<string, string> = {};
    const failedExtractions: string[] = [];

    for (const directive of directives) {
        const value = extractValueFromResponse(
            response,
            directive.responsePath,
        );

        if (value !== undefined) {
            extractedVariables[directive.varName] = value;
            logger.debug(
                `Extracted ${directive.varName} = "${value}" from path "${directive.responsePath}"`,
            );
        } else {
            failedExtractions.push(directive.varName);
            logger.warn(
                `Failed to extract ${directive.varName} from path "${directive.responsePath}"`,
            );
        }
    }

    // Persist to environment file if we extracted any variables
    if (Object.keys(extractedVariables).length > 0) {
        try {
            await updateEnvFileVariables(extractedVariables, workspaceFolder);
        } catch (error) {
            logger.error("Failed to persist extracted variables:", error);
            throw error;
        }
    }

    // Log warnings for failed extractions
    if (failedExtractions.length > 0) {
        logger.warn(
            `Could not extract values for: ${failedExtractions.join(", ")}`,
        );
    }

    return extractedVariables;
}
