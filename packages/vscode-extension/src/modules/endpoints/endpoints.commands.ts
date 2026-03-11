import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommand, wrapCommandWithRefresh } from "@/shared/command-wrapper";
import type { EndpointsService } from "@/modules/endpoints";
import type { CollectionNode, EndpointNode } from "@/modules/collections";
import type { CollectionsTreeProvider } from "@/modules/collections";
import type { ApiEndpoint } from "./endpoints.types";
import { openEndpointEditor } from "./endpoints.editor";

export function registerEndpointCommands(
    context: vscode.ExtensionContext,
    endpointsService: EndpointsService,
    treeProvider: CollectionsTreeProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.ADD_ENDPOINT,
            wrapCommandWithRefresh(
                {
                    commandName: "addEndpoint",
                    errorMessagePrefix: "Failed to create endpoint",
                },
                async (collectionNode: CollectionNode) => {
                    await endpointsService.createInteractive(
                        collectionNode.collection.id,
                    );
                },
                () => treeProvider.refresh(),
            ),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.DELETE_ENDPOINT,
            wrapCommandWithRefresh(
                {
                    commandName: "deleteEndpoint",
                    errorMessagePrefix: "Failed to delete endpoint",
                },
                async (item: EndpointNode, items?: EndpointNode[]) => {
                    const targets = items?.length ? items : [item];
                    if (!targets.length) return;

                    const endpointIds = targets.map((n) => n.endpoint.id);
                    const confirmed =
                        await endpointsService.confirmBulkDelete(endpointIds);

                    if (confirmed) {
                        await endpointsService.bulkDelete(endpointIds);
                    }
                },
                () => treeProvider.refresh(),
            ),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "watchapi.openEndpoint",
            wrapCommand(
                {
                    commandName: "openEndpoint",
                    errorMessagePrefix: "Failed to open endpoint",
                },
                async (
                    endpoint: ApiEndpoint,
                    collectionName: string,
                    duplicateIndex?: number,
                ) => {
                    await openEndpointEditor(
                        endpoint,
                        collectionName,
                        duplicateIndex,
                    );
                },
            ),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            COMMANDS.GO_TO_FILE,
            wrapCommand(
                {
                    commandName: "goToFile",
                    errorMessagePrefix: "Failed to navigate to source file",
                },
                async (item: EndpointNode) => {
                    const endpoint = item.endpoint;
                    if (!endpoint.sourceLocation) {
                        vscode.window.showInformationMessage(
                            "No source file associated with this endpoint.",
                        );
                        return;
                    }

                    // Parse "path:line" format
                    const lastColon = endpoint.sourceLocation.lastIndexOf(":");
                    const hasLine =
                        lastColon > 0 &&
                        /^\d+$/.test(
                            endpoint.sourceLocation.slice(lastColon + 1),
                        );
                    const filePath = hasLine
                        ? endpoint.sourceLocation.slice(0, lastColon)
                        : endpoint.sourceLocation;
                    const line = hasLine
                        ? parseInt(
                              endpoint.sourceLocation.slice(lastColon + 1),
                              10,
                          ) - 1 // convert 1-based to 0-based
                        : 0;

                    const uri = vscode.Uri.file(filePath);
                    const document =
                        await vscode.workspace.openTextDocument(uri);
                    const editor =
                        await vscode.window.showTextDocument(document);

                    const position = new vscode.Position(line, 0);
                    editor.selection = new vscode.Selection(
                        position,
                        position,
                    );
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter,
                    );
                },
            ),
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "watchapi.findEndpoint",
            wrapCommand(
                {
                    commandName: "findEndpoint",
                    errorMessagePrefix: "Failed to find endpoint",
                },
                async () => {
                    const items = await endpointsService.getEndpointPickItems();

                    if (!items.length) {
                        vscode.window.showInformationMessage(
                            "No endpoints found",
                        );
                        return;
                    }

                    const selected = await endpointsService.pickEndpoint();

                    if (!selected) return;

                    await openEndpointEditor(
                        selected.endpoint,
                        selected.collectionName,
                        selected.duplicateIndex,
                    );
                },
            ),
        ),
    );
}
