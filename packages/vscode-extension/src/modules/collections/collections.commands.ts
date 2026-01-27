/**
 * Collection command handlers
 * Commands: ADD_COLLECTION, DELETE_COLLECTION
 */

import * as vscode from "vscode";
import { COMMANDS } from "@/shared/constants";
import { wrapCommandWithRefresh } from "@/shared/command-wrapper";
import type { CollectionsService, CollectionNode } from "@/modules/collections";
import type { CollectionsTreeProvider } from "@/modules/collections";

export function registerCollectionCommands(
	context: vscode.ExtensionContext,
	collectionsService: CollectionsService,
	treeProvider: CollectionsTreeProvider,
): void {
	// Add collection command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			COMMANDS.ADD_COLLECTION,
			wrapCommandWithRefresh(
				{
					commandName: "addCollection",
					errorMessagePrefix: "Failed to create collection",
				},
				async () => {
					await collectionsService.createInteractive();
				},
				() => treeProvider.refresh(),
			),
		),
	);

	// Delete collection command
	context.subscriptions.push(
		vscode.commands.registerCommand(
			COMMANDS.DELETE_COLLECTION,
			wrapCommandWithRefresh(
				{
					commandName: "deleteCollection",
					errorMessagePrefix: "Failed to delete collection",
				},
				async (item: CollectionNode, items?: CollectionNode[]) => {
					const targets = items?.length ? items : [item];
					if (!targets.length) return;

					const collectionIds = targets.map((n) => n.collection.id);
					const confirmed = await collectionsService.confirmBulkDelete(
						collectionIds,
					);

					if (confirmed) {
						await collectionsService.bulkDelete(collectionIds);
					}
				},
				() => treeProvider.refresh(),
			),
		),
	);
}
