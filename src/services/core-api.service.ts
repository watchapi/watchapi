import * as vscode from "vscode";
import { Collection, CollectionEndpoint } from "../models/collection";
import { HttpMethod } from "../models/request";
import { ensureGuestLogin, getOrCreateInstallId } from "./auth.service";
import { createApiClientFromConfig } from "./trpc.service";

type TrpcCollection = {
  id: string;
  name: string;
  createdAt?: string;
  apiEndpoints?: Array<{
    id: string;
    name: string;
    url: string;
    method: HttpMethod;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

function toTimestamp(value?: string) {
  if (!value) {
    return Date.now();
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
}

function toClientEndpoint(endpoint: {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  createdAt?: string;
  updatedAt?: string;
}): CollectionEndpoint {
  return {
    id: endpoint.id,
    name: endpoint.name,
    method: endpoint.method,
    url: endpoint.url,
    timestamp: toTimestamp(endpoint.updatedAt ?? endpoint.createdAt),
  };
}

function toClientCollection(collection: TrpcCollection): Collection {
  const endpoints = collection.apiEndpoints?.map(toClientEndpoint) ?? [];
  return {
    id: collection.id,
    name: collection.name,
    createdAt: toTimestamp(collection.createdAt),
    endpoints,
  };
}

export class CoreApiService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private async createAuthedClient() {
    const installId = await getOrCreateInstallId(this.context);
    const tokens = await ensureGuestLogin(this.context);
    return createApiClientFromConfig({
      installId,
      apiToken: tokens.accessToken,
    });
  }

  async pullCollections(): Promise<Collection[]> {
    const client = await this.createAuthedClient();
    const result = await client.query<TrpcCollection[]>(
      "collection.getMyCollections",
    );
    return result.map(toClientCollection);
  }

  async createCollection(name: string) {
    const client = await this.createAuthedClient();
    await client.mutation("collection.createCollection", { name });
  }

  async renameCollection(input: { id: string; name: string }) {
    const client = await this.createAuthedClient();
    await client.mutation("collection.updateCollection", input);
  }

  async deleteCollection(id: string) {
    const client = await this.createAuthedClient();
    await client.mutation("collection.deleteCollection", { id });
  }

  async createEndpoint(input: {
    collectionId: string;
    name: string;
    url: string;
    method: HttpMethod;
  }) {
    const client = await this.createAuthedClient();
    await client.mutation("apiEndpoint.create", {
      name: input.name,
      url: input.url,
      method: input.method,
      collectionId: input.collectionId,
    });
  }

  async deleteEndpoint(id: string) {
    const client = await this.createAuthedClient();
    await client.mutation("apiEndpoint.delete", { id });
  }
}
