/**
 * tRPC client setup for communicating with WatchAPI backend
 */

import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import { getApiUrl } from "@/shared/config";
import { logger } from "@/shared/logger";
import { NetworkError } from "@/shared/errors";

type TrpcClient = {
  query: (path: string, input?: unknown) => Promise<any>;
  mutation: (path: string, input?: unknown) => Promise<any>;
};

/**
 * Get the authorization token from storage
 * This will be implemented by the auth module
 */
let getAuthToken: () => Promise<string | undefined> = async () => undefined;
let refreshTokenHandler: () => Promise<boolean> = async () => false;

export function setAuthTokenProvider(
  provider: () => Promise<string | undefined>,
): void {
  getAuthToken = provider;
}

export function setRefreshTokenHandler(
  handler: () => Promise<boolean>,
): void {
  refreshTokenHandler = handler;
}

/**
 * API Client for communicating with WatchAPI backend
 */
export class ApiClient {
  private client: TrpcClient;

  constructor() {
    const url = getApiUrl();

    this.client = createTRPCUntypedClient({
      links: [
        httpBatchLink({
          url,
          async headers() {
            const token = await getAuthToken();
            return {
              ...(token && { authorization: `Bearer ${token}` }),
            };
          },
          async fetch(url, options) {
            logger.debug(`tRPC request: ${url}`, { options });

            try {
              const response = await fetch(url, options);

              // Handle 401 Unauthorized - attempt token refresh
              if (response.status === 401) {
                logger.info("Received 401, attempting token refresh");
                const refreshed = await refreshTokenHandler();

                if (refreshed) {
                  // Retry request with new token
                  logger.info("Token refreshed, retrying request");
                  const newToken = await getAuthToken();

                  const retryOptions = {
                    ...options,
                    headers: {
                      ...options?.headers,
                      ...(newToken && { authorization: `Bearer ${newToken}` }),
                    },
                  };

                  return fetch(url, retryOptions);
                }
              }

              return response;
            } catch (error) {
              logger.error("tRPC network error", error);
              const message = error instanceof Error ? error.message : String(error);
              throw new NetworkError(
                `Failed to connect to WatchAPI server: ${message}`,
              );
            }
          },
        }),
      ],
    }) as unknown as TrpcClient;
  }

  // User methods
  async getMe() {
    const token = await getAuthToken();
    if (!token) {
      return null;
    }

    return this.client.query("auth.verifyToken", { token });
  }

  async refreshToken(input: { refreshToken: string }) {
    return this.client.mutation("auth.refreshToken", input);
  }

  // Collection methods
  async getMyCollections() {
    return this.client.query("collection.getMyCollections");
  }

  async getCollection(input: { id: string }) {
    return this.client.query("collection.getCollection", input);
  }

  async createCollection(input: { name: string; description?: string }) {
    return this.client.mutation("collection.createCollection", input);
  }

  async updateCollection(input: {
    id: string;
    name?: string;
    description?: string;
  }) {
    return this.client.mutation("collection.updateCollection", input);
  }

  async deleteCollection(input: { id: string }) {
    return this.client.mutation("collection.deleteCollection", input);
  }

  async duplicateCollection(input: { id: string }) {
    return this.client.mutation("collection.duplicateCollection", input);
  }

  async searchCollections(input: { query: string }) {
    return this.client.query("collection.searchCollections", input);
  }

  // API Endpoint methods

  async getEndpoints() {
    return this.client.query("apiEndpoint.getEndpoints");
  }

  async getEndpoint(input: { id: string }) {
    return this.client.query("apiEndpoint.get", input);
  }

  async createEndpoint(input: any) {
    return this.client.mutation("apiEndpoint.create", input);
  }

  async updateEndpoint(input: any) {
    return this.client.mutation("apiEndpoint.update", input);
  }

  async deleteEndpoint(input: { id: string }) {
    return this.client.mutation("apiEndpoint.delete", input);
  }

  // Organization methods
  async getMyOrganizations() {
    return this.client.query("organization.getMyOrganizations");
  }

  async switchOrganization(input: { organizationId: string }) {
    return this.client.mutation("auth.switchOrganization", input);
  }
}

// Export singleton client instance
export const trpc = new ApiClient();
