/**
 * Shared TypeScript types
 * These types should match the backend schemas from README
 */

import { HttpMethod } from "./constants";

// Organization types
export interface Organization {
    id: string;
    name: string;
    slug: string;
    description?: string;
    plan: "FREE" | "PRO" | "ENTERPRISE";
    role?: "OWNER" | "ADMIN" | "MEMBER";
    status?: "ACTIVE" | "PENDING";
    joinedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UserOrganization extends Organization {
    role: "OWNER" | "ADMIN" | "MEMBER";
    status: "ACTIVE" | "PENDING";
    joinedAt: string;
}

// Collection types
export interface Collection {
    id: string;
    name: string;
    description?: string;
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCollectionInput {
    name: string;
    description?: string;
}

export interface UpdateCollectionInput {
    name?: string;
    description?: string;
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
    // Deprecated fields (kept for backwards compatibility)
    headers?: Record<string, string>;
    body?: string;
    expectedStatus: number;
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
    // Deprecated fields (kept for backwards compatibility)
    headers?: Record<string, string>;
    body?: string;
    expectedStatus?: number;
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
    // Deprecated fields (kept for backwards compatibility)
    headers?: Record<string, string>;
    body?: string;
    expectedStatus?: number;
    timeout?: number;
    interval?: number;
    isActive?: boolean;
}

// Environment types
export interface EnvironmentVariable {
    key: string;
    value: string;
    description?: string;
    enabled: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: EnvironmentVariable[];
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

// Parsed route types (for Next.js/tRPC detection)
export interface ParsedRoute {
    name: string;
    path: string;
    method: HttpMethod;
    filePath: string;
    handlerName?: string; // For generating stable externalId
    type: "nextjs-app" | "nextjs-page" | "trpc" | "nestjs";
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: string;
}

// Cache types
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// Sync state
export interface SyncState {
    isSyncing: boolean;
    lastSyncTime?: number;
    error?: string;
}
