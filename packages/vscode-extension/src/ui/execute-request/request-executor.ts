import got, { Method, OptionsOfBufferResponseBody } from "got";
import { replaceEnvironmentVariables } from "@/parsers";
import { ApiEndpoint, Environment, HttpMethod } from "@/shared";
import { HttpRequest } from "@/shared/http-request";
import { HttpResponse } from "@/shared/http-response";
import { RequestHeaders } from "@/shared/base";
import { hasHeader } from "@/shared/misc";

export interface ExecutionRequest {
    method: HttpMethod;
    url: string;
    headers: RequestHeaders;
    body?: string;
}

export interface ExecutionContext {
    environment?: Environment;
    fileVariables?: Record<string, string>;
}

export class RequestExecutor {
    private currentRequest: HttpRequest | null = null;

    /**
     * Execute an API endpoint with variable substitution
     */
    async execute(
        endpoint: ApiEndpoint,
        context?: ExecutionContext,
    ): Promise<HttpResponse> {
        const executionRequest = this.buildRequest(endpoint, context);

        const httpRequest = new HttpRequest(
            executionRequest.method,
            executionRequest.url,
            executionRequest.headers,
            executionRequest.body,
            executionRequest.body,
        );

        this.currentRequest = httpRequest;

        const options: OptionsOfBufferResponseBody = {
            method: httpRequest.method.toLowerCase() as Method,
            headers: httpRequest.headers as Record<string, string>,
            body: httpRequest.body as string | undefined,
            throwHttpErrors: false,
            decompress: true,
            followRedirect: true,
            responseType: "buffer",
            timeout: {
                request: 60000,
            },
            retry: {
                limit: 0,
            },
        };

        try {
            const request = got(executionRequest.url, options);
            httpRequest.setUnderlyingRequest(request);

            const response = await request;

            return new HttpResponse(
                response.statusCode,
                response.statusMessage ?? "",
                response.httpVersion,
                response.headers,
                response.body.toString(),
                response.body.length,
                Buffer.byteLength(
                    Object.entries(response.headers)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join("\r\n"),
                ),
                response.body,
                response.timings.phases,
                httpRequest,
            );
        } catch (error) {
            if (httpRequest.isCancelled) {
                throw new Error("Request was cancelled");
            }
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Request failed: ${errorMessage}`);
        } finally {
            this.currentRequest = null;
        }
    }

    cancel(): void {
        this.currentRequest?.cancel();
    }

    private buildRequest(
        endpoint: ApiEndpoint,
        context?: ExecutionContext,
    ): ExecutionRequest {
        const effectiveHeaders: RequestHeaders = {
            ...(endpoint.headersSchema ?? {}),
            ...(endpoint.headersOverrides ?? {}),
        };

        const effectiveQuery = {
            ...(endpoint.querySchema ?? {}),
            ...(endpoint.queryOverrides ?? {}),
        };

        let effectiveBody = endpoint.bodyOverrides ?? endpoint.bodySchema;

        let url = endpoint.requestPath;

        if (Object.keys(effectiveQuery).length > 0) {
            const queryString = Object.entries(effectiveQuery)
                .map(
                    ([key, value]) =>
                        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
                )
                .join("&");
            url = `${url}?${queryString}`;
        }

        // Replace variables (system vars are handled inside replaceEnvironmentVariables)
        url = replaceEnvironmentVariables(
            url,
            context?.environment,
            context?.fileVariables,
        );

        Object.keys(effectiveHeaders).forEach((key) => {
            const value = effectiveHeaders[key];
            if (typeof value === "string") {
                effectiveHeaders[key] = replaceEnvironmentVariables(
                    value,
                    context?.environment,
                    context?.fileVariables,
                );
            }
        });

        if (effectiveBody) {
            effectiveBody = replaceEnvironmentVariables(
                effectiveBody,
                context?.environment,
                context?.fileVariables,
            );
        }

        if (effectiveBody && !hasHeader(effectiveHeaders, "content-type")) {
            effectiveHeaders["Content-Type"] = "application/json";
        }

        return {
            method: endpoint.method,
            url,
            headers: effectiveHeaders,
            body: effectiveBody,
        };
    }
}
