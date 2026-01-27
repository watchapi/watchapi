/**
 * Local storage service
 * Handles storing collections and endpoints in VS Code storage
 */

import * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { Collection } from "@/modules/collections/collections.types";
import type { ApiEndpoint, CreateApiEndpointInput } from "@/modules/endpoints/endpoints.types";

const STORAGE_KEYS = {
  COLLECTIONS: "watchapi.local.collections",
  ENDPOINTS: "watchapi.local.endpoints",
} as const;

export class LocalStorageService {
  constructor(private context: vscode.ExtensionContext) {}

  // Collections
  // Note: Using workspaceState for per-project scoping (data is isolated per workspace)

  async getCollections(): Promise<Collection[]> {
    return (
      this.context.workspaceState.get<Collection[]>(STORAGE_KEYS.COLLECTIONS) || []
    );
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    const collections = await this.getCollections();
    return collections.find((c) => c.id === id);
  }

  async createCollection(
    input: Omit<Collection, "id" | "createdAt" | "updatedAt">,
  ): Promise<Collection> {
    const collections = await this.getCollections();
    const now = new Date().toISOString();

    const collection: Collection = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    collections.push(collection);
    await this.context.workspaceState.update(
      STORAGE_KEYS.COLLECTIONS,
      collections,
    );

    return collection;
  }

  async updateCollection(
    id: string,
    updates: Partial<Omit<Collection, "id" | "createdAt">>,
  ): Promise<Collection | undefined> {
    const collections = await this.getCollections();
    const index = collections.findIndex((c) => c.id === id);

    if (index === -1) {
      return undefined;
    }

    collections[index] = {
      ...collections[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.context.workspaceState.update(
      STORAGE_KEYS.COLLECTIONS,
      collections,
    );

    return collections[index];
  }

  async deleteCollection(id: string): Promise<boolean> {
    const collections = await this.getCollections();
    const filtered = collections.filter((c) => c.id !== id);

    if (filtered.length === collections.length) {
      return false;
    }

    // Also delete all endpoints in this collection
    const endpoints = await this.getEndpoints();
    const filteredEndpoints = endpoints.filter((e) => e.collectionId !== id);
    await this.context.workspaceState.update(
      STORAGE_KEYS.ENDPOINTS,
      filteredEndpoints,
    );

    await this.context.workspaceState.update(STORAGE_KEYS.COLLECTIONS, filtered);

    return true;
  }

  // Endpoints

  async getEndpoints(): Promise<ApiEndpoint[]> {
    return (
      this.context.workspaceState.get<ApiEndpoint[]>(STORAGE_KEYS.ENDPOINTS) || []
    );
  }

  async getEndpoint(id: string): Promise<ApiEndpoint | undefined> {
    const endpoints = await this.getEndpoints();
    return endpoints.find((e) => e.id === id);
  }

  async getEndpointsByCollection(collectionId: string): Promise<ApiEndpoint[]> {
    const endpoints = await this.getEndpoints();
    return endpoints.filter((e) => e.collectionId === collectionId);
  }

  async createEndpoint(
    input: CreateApiEndpointInput,
  ): Promise<ApiEndpoint> {
    const endpoints = await this.getEndpoints();
    const now = new Date().toISOString();

    const endpoint: ApiEndpoint = {
      id: randomUUID(),
      ...input,
      timeout: input.timeout ?? 30000,
      interval: input.interval ?? 300000,
      isActive: input.isActive ?? false,
      createdAt: now,
      updatedAt: now,
    };

    endpoints.push(endpoint);
    await this.context.workspaceState.update(STORAGE_KEYS.ENDPOINTS, endpoints);

    return endpoint;
  }

  async updateEndpoint(
    id: string,
    updates: Partial<Omit<ApiEndpoint, "id" | "createdAt">>,
  ): Promise<ApiEndpoint | undefined> {
    const endpoints = await this.getEndpoints();
    const index = endpoints.findIndex((e) => e.id === id);

    if (index === -1) {
      return undefined;
    }

    endpoints[index] = {
      ...endpoints[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.context.workspaceState.update(STORAGE_KEYS.ENDPOINTS, endpoints);

    return endpoints[index];
  }

  async deleteEndpoint(id: string): Promise<boolean> {
    const endpoints = await this.getEndpoints();
    const filtered = endpoints.filter((e) => e.id !== id);

    if (filtered.length === endpoints.length) {
      return false;
    }

    await this.context.workspaceState.update(STORAGE_KEYS.ENDPOINTS, filtered);

    return true;
  }

  // Bulk operations (for sync)

  async setCollections(collections: Collection[]): Promise<void> {
    await this.context.workspaceState.update(
      STORAGE_KEYS.COLLECTIONS,
      collections,
    );
  }

  async setEndpoints(endpoints: ApiEndpoint[]): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEYS.ENDPOINTS, endpoints);
  }

  async clearAll(): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEYS.COLLECTIONS, []);
    await this.context.workspaceState.update(STORAGE_KEYS.ENDPOINTS, []);
  }
}
