import * as vscode from "vscode";
import { ApiEndpoint, Environment } from "@/shared";
import {
    readRestClientEnvFile,
    resolveEnvironmentFromEnvFile,
} from "@/environments";
import { extractFileVariables, extractSetDirectives } from "@/parsers";
import { RequestExecutor, ExecutionContext } from "./request-executor";
import { showResponsePanel } from "./response-panel";
import { processSetDirectives } from "./response-variable-handler";

export class ExecutionButton {
    private executor: RequestExecutor;

    constructor() {
        this.executor = new RequestExecutor();
    }

    private get activeEditor(): vscode.TextEditor {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error("No active editor found.");
        }
        return editor;
    }

    private get workspaceFolder(): vscode.WorkspaceFolder {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            throw new Error("No workspace folder found.");
        }
        return folder;
    }

    registerCommand(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                "watchapi.executeFromEditor",
                async (partialEndpoint: Partial<ApiEndpoint>) => {
                    await this.executeFromEditor(partialEndpoint);
                },
            ),
        );
    }

    private async executeFromEditor(
        partialEndpoint: Partial<ApiEndpoint>,
    ): Promise<void> {
        const editor = this.activeEditor;
        const documentContent = editor.document.getText();

        const setDirectives = extractSetDirectives(documentContent);

        const endpoint: ApiEndpoint = {
            id: "temp-" + Date.now(),
            collectionId: "editor",
            name: partialEndpoint.name || "Untitled Request",
            method: partialEndpoint.method || "GET",
            requestPath: partialEndpoint.requestPath || "",
            pathTemplate:
                partialEndpoint.pathTemplate ||
                partialEndpoint.requestPath ||
                "",
            headersOverrides: partialEndpoint.headersOverrides,
            queryOverrides: partialEndpoint.queryOverrides,
            bodyOverrides: partialEndpoint.bodyOverrides,
            setDirectivesOverrides:
                setDirectives.length > 0 ? setDirectives : undefined,
            timeout: partialEndpoint.timeout!,
            interval: partialEndpoint.interval!,
            isActive: partialEndpoint.isActive!,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const environment = await this.loadEnvironment();
        const fileVariables = extractFileVariables(documentContent);

        await this.executeRequest(endpoint, {
            environment,
            fileVariables,
        });
    }

    private async executeRequest(
        endpoint: ApiEndpoint,
        context: ExecutionContext,
    ): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Executing ${endpoint.method} ${endpoint.requestPath}`,
                cancellable: false,
            },
            async () => {
                const response = await this.executor.execute(endpoint, context);
                await showResponsePanel(endpoint, response);
                const directives = endpoint.setDirectivesOverrides;

                if (!directives?.length) return;

                try {
                    const extractedVars = await processSetDirectives(
                        directives,
                        { body: response.body, headers: response.headers },
                        this.workspaceFolder,
                    );

                    if (Object.keys(extractedVars).length) {
                        vscode.window.showInformationMessage(
                            `Updated variables: ${Object.keys(extractedVars).join(", ")}`,
                        );
                    }
                } catch (error) {
                    vscode.window.showWarningMessage(
                        `Failed to extract response variables: ${error}`,
                    );
                }

                this.showStatusMessage(response);
            },
        );
    }

    private async loadEnvironment(): Promise<Environment | undefined> {
        const workspaceFolder = this.workspaceFolder;
        const envFile = await readRestClientEnvFile(workspaceFolder);
        return resolveEnvironmentFromEnvFile(envFile);
    }

    private showStatusMessage(response: any): void {
        const statusClass = this.getStatusClass(response.statusCode);
        const timing = response.timingPhases?.total ?? 0;
        const message = `${statusClass} ${response.statusCode} ${response.statusMessage} • ${Math.round(timing)}ms`;
        vscode.window.setStatusBarMessage(message, 3000);
    }

    private getStatusClass(status: number): string {
        if (status >= 200 && status < 300) return "✓";
        if (status >= 300 && status < 400) return "↻";
        if (status >= 400 && status < 500) return "⚠";
        if (status >= 500) return "✗";
        return "○";
    }
}
