/**
 * Shared TypeScript types
 * These types should match the backend schemas from README
 */

import { HttpMethod } from './constants';

// User & Auth types
export interface User {
	id: string;
	email: string;
	name?: string;
	organizationId?: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken?: string;
}

// Organization types
export interface Organization {
	id: string;
	name: string;
	slug: string;
	description?: string;
	plan: 'FREE' | 'PRO' | 'ENTERPRISE';
	role?: 'OWNER' | 'ADMIN' | 'MEMBER';
	status?: 'ACTIVE' | 'PENDING';
	joinedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface UserOrganization extends Organization {
	role: 'OWNER' | 'ADMIN' | 'MEMBER';
	status: 'ACTIVE' | 'PENDING';
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
	name: string;
	url: string;
	method: HttpMethod;
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
	name: string;
	url: string;
	method: HttpMethod;
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
	url?: string;
	method?: HttpMethod;
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

export interface CreateEnvironmentInput {
	name: string;
	variables?: EnvironmentVariable[];
	isDefault?: boolean;
}

export interface UpdateEnvironmentInput {
	id: string;
	name?: string;
	variables?: EnvironmentVariable[];
	isDefault?: boolean;
}

// Parsed route types (for Next.js/tRPC detection)
export interface ParsedRoute {
	name: string;
	path: string;
	method: HttpMethod;
	filePath: string;
	type: 'nextjs-app' | 'nextjs-page' | 'trpc';
	headers?: Record<string, string>;
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

// Tree item types for VS Code TreeView
export interface CollectionTreeItem {
	type: 'collection';
	collection: Collection;
	endpoints: ApiEndpoint[];
}

export interface EndpointTreeItem {
	type: 'endpoint';
	endpoint: ApiEndpoint;
	collection?: Collection;
}

export type TreeItem = CollectionTreeItem | EndpointTreeItem;
