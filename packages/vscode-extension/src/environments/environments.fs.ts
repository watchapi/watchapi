/**
 * Environment file system operations
 * Handles creation, reading, and checking of the REST Client environment file
 */

import * as vscode from "vscode";
import { flatten } from "flat";
import { ENV_FILE_NAME, Environment, logger } from "@/shared";

/**
 * Check if environment file exists in the workspace
 */
export async function checkEnvFileExists(): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return true; // No workspace, consider OK

    const envUri = vscode.Uri.joinPath(workspaceFolder.uri, ENV_FILE_NAME);

    try {
        await vscode.workspace.fs.stat(envUri);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read rest-client.env.json from the workspace root.
 */
export async function readRestClientEnvFile(
    workspaceFolder?: vscode.WorkspaceFolder,
): Promise<Record<string, string>> {
    const root = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!root) return {};

    const envUri = vscode.Uri.joinPath(root.uri, ENV_FILE_NAME);

    try {
        const bytes = await vscode.workspace.fs.readFile(envUri);
        const text = Buffer.from(bytes).toString("utf8");
        return JSON.parse(text) as Record<string, string>;
    } catch {
        return {};
    }
}

/**
 * Resolve the active environment (defaults to "local" when present).
 */
export function resolveEnvironmentFromEnvFile(
    envFile: Record<string, unknown>,
    preferredName?: string,
): Environment | undefined {
    const envName =
        (preferredName && preferredName in envFile && preferredName) ||
        ("local" in envFile ? "local" : Object.keys(envFile)[0]);
    if (!envName) return undefined;

    const rawEnv = envFile[envName] as Record<string, unknown>;
    if (!rawEnv || typeof rawEnv !== "object") return undefined;

    const flatEnv = flatten(rawEnv, {
        delimiter: ".",
        safe: true,
    }) as Record<string, unknown>;

    const variables = Object.entries(flatEnv)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => ({
            key,
            value: String(value),
            enabled: true,
        }));

    return {
        id: envName,
        name: envName,
        variables,
        isDefault: envName === "local",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Create the environment file with default structure
 * @param options - Configuration options
 * @param options.silent - If true, don't show info message (default: false)
 * @param options.openFile - If true, open the file after creation (default: false)
 * @returns true if file was created, false if workspace not found or creation failed
 */
export async function createEnvFile(
    options: { silent?: boolean; openFile?: boolean } = {},
): Promise<boolean> {
    const { silent = false, openFile = false } = options;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        if (!silent) {
            vscode.window.showErrorMessage(
                "No workspace folder found. Please open a folder first.",
            );
        }
        return false;
    }

    const envUri = vscode.Uri.joinPath(workspaceFolder.uri, ENV_FILE_NAME);

    try {
        const defaultContent = {
            local: {
                baseUrl: "http://localhost:3000",
                authToken: "",
            },
            prod: {},
        };

        const content = JSON.stringify(defaultContent, null, 2);
        await vscode.workspace.fs.writeFile(
            envUri,
            Buffer.from(content, "utf8"),
        );

        logger.info(`Created ${ENV_FILE_NAME} file`);

        if (!silent) {
            vscode.window.showInformationMessage(
                `${ENV_FILE_NAME} was created automatically`,
            );
        }

        // Open the file if requested
        if (openFile) {
            const doc = await vscode.workspace.openTextDocument(envUri);
            await vscode.window.showTextDocument(doc);
        }

        return true;
    } catch (error) {
        logger.error(`Failed to create ${ENV_FILE_NAME}:`, error);
        if (!silent) {
            vscode.window.showErrorMessage(
                `Failed to create ${ENV_FILE_NAME}: ${String(error)}`,
            );
        }
        return false;
    }
}

/**
 * Ensure environment file exists, creating it if necessary
 * @param options - Configuration options (see createEnvFile)
 * @returns true if file was created, false if it already existed or creation failed
 */
export async function ensureEnvFile(
    options: { silent?: boolean; openFile?: boolean } = {},
): Promise<boolean> {
    const exists = await checkEnvFileExists();
    if (exists) {
        return false; // File already exists
    }

    return await createEnvFile(options);
}
