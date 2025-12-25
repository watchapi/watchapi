import * as vscode from "vscode";
import { Collection, CollectionEndpoint } from "../models/collection";
import { HttpMethod } from "../models/request";
import { ensureGuestLogin, getOrCreateInstallId } from "../auth/auth.service";
import { createApiClientFromConfig } from "./trpc.service";
import { parseHttpRequestDocument } from "../utils/parse-http-request";
import { normalizeHeaders } from "../utils/normalize-headers";
import { loadRestClientEnvEntries } from "../utils/rest-client-env";

type TrpcCollection = {
  id: string;
  name: string;
  createdAt?: string;
  apiEndpoints?: Array<{
    id: string;
    name: string;
    url: string;
    method: HttpMethod;
    headers?: Record<string, string> | string | null;
    body?: string | null;
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
  headers?: Record<string, string> | string | null;
  body?: string | null;
  createdAt?: string;
  updatedAt?: string;
}): CollectionEndpoint {
  return {
    id: endpoint.id,
    name: endpoint.name,
    method: endpoint.method,
    url: endpoint.url,
    headers: normalizeHeaders(endpoint.headers),
    body: endpoint.body ?? null,
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
    const tokens = await ensureGuestLogin(this.context, { installId });
    return createApiClientFromConfig({
      installId,
      apiToken: tokens.accessToken,
    });
  }

  async pullCollections(): Promise<Collection[]> {
    await this.syncRestClientEnvironment();
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

  async updateEndpointFromHttpDocument(input: {
    id: string;
    httpContent: string;
  }) {
    const client = await this.createAuthedClient();
    const parsed = parseHttpRequestDocument(input.httpContent);

    const payload: Record<string, unknown> = {
      id: input.id,
    };

    if (parsed) {
      payload.method = parsed.method;
      payload.url = parsed.url;
      payload.headers =
        parsed.headers && Object.keys(parsed.headers).length > 0
          ? parsed.headers
          : {};
      payload.body = parsed.body ?? "";
    }

    if (!parsed) {
      throw new Error("Unable to parse HTTP request document");
    }

    const candidates = [
      "apiEndpoint.update",
      "collection.updateEndpoint",
    ] as const;

    let lastError: unknown = null;
    for (const path of candidates) {
      try {
        await client.mutation(path, payload);
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        const mightBeUnknownProcedure =
          message.includes("No") ||
          message.toLowerCase().includes("not found") ||
          message.toLowerCase().includes("procedure");

        if (mightBeUnknownProcedure) {
          continue;
        }

        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to update endpoint from document");
  }

  async findEndpointById(
    endpointId: string,
  ): Promise<CollectionEndpoint | undefined> {
    const collections = await this.pullCollections();
    for (const collection of collections) {
      const match = collection.endpoints.find(
        (endpoint) => endpoint.id === endpointId,
      );
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  async syncRestClientEnvironment(envName = "prod") {
    const variables = await loadRestClientEnvEntries(envName);
    if (variables.length === 0) {
      return;
    }

    const client = await this.createAuthedClient();
    await client.mutation("environment.createEnvironment", {
      name: envName,
      variables,
      isDefault: true,
    });
  }
}
