/**
 * Shared types for parsers
 */

import { HttpMethod } from "./constants";

// API Endpoint types
export interface ApiEndpoint {
	id: string;
	externalId?: string; // Stable identifier from source (file path + handler)
	name: string;
	pathTemplate: string; // Route pattern from source (e.g., "/api/users/:id")
	requestPath: string; // Actual request URL (e.g., "/api/users/123")
	method: HttpMethod;
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
