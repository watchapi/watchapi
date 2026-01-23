import * as vscode from "vscode";
import { ApiEndpoint, Environment } from "@/shared";
import type { EndpointNode } from "@/collections";
import {
    readRestClientEnvFile,
    resolveEnvironmentFromEnvFile,
} from "@/environments";
import { extractFileVariables } from "@/parsers";
import { RequestExecutor, ExecutionContext } from "./request-executor";
import { showResponsePanel } from "./response-panel";

export class ExecutionButton {
    private executor: RequestExecutor;

    constructor() {
        this.executor = new RequestExecutor();
    }

    registerCommand(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                "watchapi.executeRequest",
                async (
                    item: ApiEndpoint | EndpointNode,
                    itemsOrEnvironment?: EndpointNode[] | Environment,
                    maybeEnvironment?: Environment,
                ) => {
                    const items = Array.isArray(itemsOrEnvironment)
                        ? itemsOrEnvironment
                        : [item];
                    let environment = Array.isArray(itemsOrEnvironment)
                        ? maybeEnvironment
                        : itemsOrEnvironment;

                    for (const target of items) {
                        const endpoint = this.normalizeEndpoint(target);
                        if (!endpoint) continue;
                        if (!environment) {
                            environment = await this.loadEnvironment();
                        }
                        await this.executeRequest(endpoint, { environment });
                    }
                },
            ),
        );

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
        const editor = vscode.window.activeTextEditor;
        const documentUri = editor?.document.uri;
        const documentContent = editor?.document.getText();

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
            expectedStatus: partialEndpoint.expectedStatus!,
            timeout: partialEndpoint.timeout!,
            interval: partialEndpoint.interval!,
            isActive: partialEndpoint.isActive!,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const environment = await this.loadEnvironment(documentUri);
        const fileVariables = documentContent
            ? extractFileVariables(documentContent)
            : undefined;

        await this.executeRequest(endpoint, { environment, fileVariables });
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
                this.showStatusMessage(response);
            },
        );
    }

    private normalizeEndpoint(
        target: ApiEndpoint | EndpointNode,
    ): ApiEndpoint | undefined {
        if ((target as EndpointNode).endpoint) {
            return (target as EndpointNode).endpoint;
        }
        return target as ApiEndpoint;
    }

    private async loadEnvironment(
        documentUri?: vscode.Uri,
    ): Promise<Environment | undefined> {
        const workspaceFolder = documentUri
            ? vscode.workspace.getWorkspaceFolder(documentUri)
            : vscode.workspace.workspaceFolders?.[0];
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
