/**
 * Endpoint-related types
 */

import { HttpMethod } from "@/shared/constants";

// Set directive for extracting response values
export interface SetDirective {
    varName: string;
    responsePath: string;
}

// API Endpoint types
export interface ApiEndpoint {
    id: string;
    externalId?: string; // Stable identifier from source (file path + handler)
    name: string;
    pathTemplate: string; // Route pattern from source (e.g., "/api/users/:id")
    requestPath: string; // Actual request URL (e.g., "/api/users/123")
    method: HttpMethod;
    // Layered schema pattern:
    // - bodySchema/headersSchema/querySchema: Code-inferred defaults (updated by sync/pull)
    // - bodyOverrides/headersOverrides/queryOverrides: User edits (never touched by sync)
    // - At runtime: effective = applyOverrides(schema, overrides)
    bodySchema?: string;
    bodyOverrides?: string;
    headersSchema?: Record<string, string>;
    headersOverrides?: Record<string, string>;
    querySchema?: Record<string, string>;
    queryOverrides?: Record<string, string>;
    // Set directives for extracting response values (@set varName = response.path)
    setDirectives?: SetDirective[];
    setDirectivesOverrides?: SetDirective[];
    timeout: number;
    interval: number;
    collectionId?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateApiEndpointInput {
    externalId?: string; // Stable identifier from source (file path + handler)
    name: string;
    pathTemplate: string; // Route pattern from source
    requestPath: string; // Actual request URL
    method: HttpMethod;
    // New layered fields
    bodySchema?: string;
    bodyOverrides?: string;
    headersSchema?: Record<string, string>;
    headersOverrides?: Record<string, string>;
    querySchema?: Record<string, string>;
    queryOverrides?: Record<string, string>;
    setDirectivesOverrides?: SetDirective[];
    timeout?: number;
    interval?: number;
    collectionId?: string;
    isActive?: boolean;
}

export interface UpdateApiEndpointInput {
    name?: string;
    pathTemplate?: string; // Route pattern from source
    requestPath?: string; // Actual request URL
    method?: HttpMethod;
    // New layered fields
    bodySchema?: string;
    bodyOverrides?: string;
    headersSchema?: Record<string, string>;
    headersOverrides?: Record<string, string>;
    querySchema?: Record<string, string>;
    queryOverrides?: Record<string, string>;
    setDirectivesOverrides?: SetDirective[];
    timeout?: number;
    interval?: number;
    isActive?: boolean;
}
