/**
 * Collections service
 * Handles business logic for collection CRUD operations
 * Supports both local storage (offline) and cloud sync (when authenticated)
 */

import * as vscode from "vscode";
import { trpc } from "@/infrastructure/api/trpc-client";
import { logger } from "@/shared/logger";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { ensureEnvFile } from "@/modules/environments";
import type { LocalStorageService } from "@/infrastructure/storage";
import type {
    Collection,
    CreateCollectionInput,
    UpdateCollectionInput,
} from "./collections.types";

export class CollectionsService {
    private localStorage?: LocalStorageService;
    private isAuthenticatedFn?: () => Promise<boolean>;

    /**
     * Set local storage for offline mode
     */
    setLocalStorage(
        localStorage: LocalStorageService,
        isAuthenticatedFn: () => Promise<boolean>,
    ): void {
        this.localStorage = localStorage;
        this.isAuthenticatedFn = isAuthenticatedFn;
    }

    private async isCloudMode(): Promise<boolean> {
        if (!this.isAuthenticatedFn) {
            return false;
        }
        return await this.isAuthenticatedFn();
    }
    /**
     * Get all collections (from cloud or local storage)
     */
    async getAll(): Promise<Collection[]> {
        try {
            const isCloud = await this.isCloudMode();

            if (isCloud) {
                logger.debug("Fetching collections from cloud");
                const collections = await trpc.getMyCollections();
                logger.info(
                    `Fetched ${collections.length} collections from cloud`,
                );
                return collections;
            } else {
                logger.debug("Fetching collections from local storage");
                const collections = await this.localStorage!.getCollections();
                logger.info(
                    `Fetched ${collections.length} collections from local`,
                );
                return collections;
            }
        } catch (error) {
            logger.error("Failed to fetch collections", error);
            throw error;
        }
    }

    /**
     * Get a single collection by ID
     */
    async getById(id: string): Promise<Collection> {
        try {
            const isCloud = await this.isCloudMode();

            if (isCloud) {
                logger.debug(`Fetching collection from cloud: ${id}`);
                const collection = await trpc.getCollection({ id });

                if (!collection) {
                    throw new NotFoundError("Collection", id);
                }

                return collection;
            } else {
                logger.debug(`Fetching collection from local: ${id}`);
                const collection = await this.localStorage!.getCollection(id);

                if (!collection) {
                    throw new NotFoundError("Collection", id);
                }

                return collection;
            }
        } catch (error) {
            logger.error(`Failed to fetch collection: ${id}`, error);
            throw error;
        }
    }

    /**
     * Create a new collection
     */
    async create(input: CreateCollectionInput): Promise<Collection> {
        try {
            // Validate input
            if (!input.name || input.name.trim().length === 0) {
                throw new ValidationError("Collection name is required");
            }

            const isCloud = await this.isCloudMode();

            let collection: Collection;

            if (isCloud) {
                logger.debug("Creating collection in cloud", input);
                collection = await trpc.createCollection(input);
                logger.info(
                    `Created collection in cloud: ${collection.name} (${collection.id})`,
                );
            } else {
                logger.debug("Creating collection locally", input);
                collection = await this.localStorage!.createCollection(input);
                logger.info(
                    `Created collection locally: ${collection.name} (${collection.id})`,
                );
            }

            await ensureEnvFile();

            return collection;
        } catch (error) {
            logger.error("Failed to create collection", error);
            throw error;
        }
    }

    /**
     * Update an existing collection
     */
    async update(
        id: string,
        input: UpdateCollectionInput,
    ): Promise<Collection> {
        try {
            const isCloud = await this.isCloudMode();

            if (isCloud) {
                logger.debug(`Updating collection in cloud: ${id}`, input);
                const collection = await trpc.updateCollection({
                    id,
                    ...input,
                });
                logger.info(
                    `Updated collection in cloud: ${collection.name} (${collection.id})`,
                );
                return collection;
            } else {
                logger.debug(`Updating collection locally: ${id}`, input);
                const collection = await this.localStorage!.updateCollection(
                    id,
                    input,
                );

                if (!collection) {
                    throw new NotFoundError("Collection", id);
                }

                logger.info(
                    `Updated collection locally: ${collection.name} (${collection.id})`,
                );
                return collection;
            }
        } catch (error) {
            logger.error(`Failed to update collection: ${id}`, error);
            throw error;
        }
    }

    /**
     * Delete a collection
     */
    async delete(id: string): Promise<void> {
        try {
            const isCloud = await this.isCloudMode();

            if (isCloud) {
                logger.debug(`Deleting collection from cloud: ${id}`);
                await trpc.deleteCollection({ id });
                logger.info(`Deleted collection from cloud: ${id}`);
            } else {
                logger.debug(`Deleting collection locally: ${id}`);
                const deleted = await this.localStorage!.deleteCollection(id);

                if (!deleted) {
                    throw new NotFoundError("Collection", id);
                }

                logger.info(`Deleted collection locally: ${id}`);
            }
        } catch (error) {
            logger.error(`Failed to delete collection: ${id}`, error);
            throw error;
        }
    }

    /**
     * Duplicate a collection (cloud only)
     */
    async duplicate(id: string): Promise<Collection> {
        try {
            const isCloud = await this.isCloudMode();

            if (!isCloud) {
                throw new Error("Duplicate is only available in cloud mode");
            }

            logger.debug(`Duplicating collection: ${id}`);
            const collection = await trpc.duplicateCollection({ id });
            logger.info(
                `Duplicated collection: ${collection.name} (${collection.id})`,
            );

            return collection;
        } catch (error) {
            logger.error(`Failed to duplicate collection: ${id}`, error);
            throw error;
        }
    }

    /**
     * Search collections by query
     */
    async search(query: string): Promise<Collection[]> {
        try {
            const isCloud = await this.isCloudMode();

            if (isCloud) {
                logger.debug(`Searching collections in cloud: ${query}`);
                const collections = await trpc.searchCollections({ query });
                logger.info(
                    `Found ${collections.length} collections in cloud matching: ${query}`,
                );
                return collections;
            } else {
                logger.debug(`Searching collections locally: ${query}`);
                const allCollections =
                    await this.localStorage!.getCollections();
                const filtered = allCollections.filter(
                    (c) =>
                        c.name.toLowerCase().includes(query.toLowerCase()) ||
                        c.description
                            ?.toLowerCase()
                            .includes(query.toLowerCase()),
                );
                logger.info(
                    `Found ${filtered.length} collections locally matching: ${query}`,
                );
                return filtered;
            }
        } catch (error) {
            logger.error("Failed to search collections", error);
            throw error;
        }
    }

    /**
     * Interactive collection creation flow
     * Shows input box and creates collection
     *
     * @returns Created collection, or undefined if cancelled
     */
    async createInteractive(): Promise<Collection | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: "Enter collection name",
            placeHolder: "e.g., User API",
        });

        if (!name) {
            return undefined;
        }

        return await this.create({ name });
    }

    /**
     * Show confirmation dialog for bulk delete
     *
     * @param collectionIds - Array of collection IDs to delete
     * @returns true if confirmed, false if cancelled
     */
    async confirmBulkDelete(collectionIds: string[]): Promise<boolean> {
        const confirm = await vscode.window.showWarningMessage(
            `Delete ${collectionIds.length} collection${
                collectionIds.length > 1 ? "s" : ""
            }?`,
            { modal: true },
            "Delete",
        );

        return confirm === "Delete";
    }

    /**
     * Delete multiple collections with progress indicator
     *
     * @param collectionIds - Array of collection IDs to delete
     */
    async bulkDelete(collectionIds: string[]): Promise<void> {
        for (const id of collectionIds) {
            await this.delete(id);
        }
    }
}
