import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";

export type TrpcClient = {
  query: <TResult = unknown>(path: string, input?: unknown) => Promise<TResult>;
  mutation: <TResult = unknown>(path: string, input?: unknown) => Promise<TResult>;
};

export type ApiClientOptions = {
  apiUrl: string;
  installId: string;
  apiToken?: string;
  organizationId?: string;
};

export class ApiClient {
  private readonly client: TrpcClient;

  constructor({ apiUrl, installId, apiToken, organizationId }: ApiClientOptions) {
    const url = new URL("/api/trpc", apiUrl).toString();

    this.client = createTRPCUntypedClient({
      links: [
        httpBatchLink({
          url,
          headers: () => {
            const headers: Record<string, string> = {};
            headers["x-watchapi-install-id"] = installId;
            if (apiToken) {
              headers.authorization = `Bearer ${apiToken}`;
            }
            if (organizationId) {
              headers["x-organization-id"] = organizationId;
            }
            return headers;
          },
        }),
      ],
    }) as unknown as TrpcClient;
  }

  query<TResult = unknown>(path: string, input?: unknown) {
    return this.client.query<TResult>(path, input);
  }

  mutation<TResult = unknown>(path: string, input?: unknown) {
    return this.client.mutation<TResult>(path, input);
  }

  get trpc() {
    return this.client;
  }

  raw() {
    return this.client;
  }
}
