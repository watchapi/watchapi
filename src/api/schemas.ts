/**
 * Zod schemas for API validation
 * These schemas match the backend tRPC schemas from README
 */

import { z } from 'zod';
import { HTTP_METHODS } from '@/shared/constants';

// HTTP Method enum
export const HttpMethod = z.enum(HTTP_METHODS);

// Collection schemas
export const createCollectionSchema = z.object({
	name: z.string().min(1, 'Collection name is required').trim(),
	description: z.string().trim().optional(),
});

export const updateCollectionSchema = z.object({
	name: z.string().min(1, 'Collection name is required').optional(),
	description: z.string().optional(),
});

export const getCollectionSchema = z.object({
	id: z.string().min(1, 'Collection ID is required').trim(),
});

export const deleteCollectionSchema = z.object({
	id: z.string().min(1, 'Collection ID is required'),
});

export const duplicateCollectionSchema = z.object({
	id: z.string().min(1, 'Collection ID is required'),
});

export const searchCollectionsSchema = z.object({
	query: z.string().min(1, 'Search query is required'),
});

// API Endpoint schemas
export const createApiEndpointSchema = z.object({
	externalId: z.string().trim().optional(),
	name: z.string().trim().min(1, 'Endpoint name is required'),
	pathTemplate: z.string().trim().min(1, 'Path template is required'),
	requestPath: z.string().trim().min(1, 'Request path is required'),
	method: HttpMethod.default('GET'),
	// Layered schema pattern
	bodySchema: z.string().trim().optional(),
	bodyOverrides: z.string().trim().optional(),
	headersSchema: z.record(z.string(), z.string()).optional(),
	headersOverrides: z.record(z.string(), z.string()).optional(),
	querySchema: z.record(z.string(), z.string()).optional(),
	queryOverrides: z.record(z.string(), z.string()).optional(),
	// Legacy fields (kept for backwards compatibility)
	headers: z.record(z.string(), z.string()).optional(),
	body: z.string().trim().optional(),
	expectedStatus: z.number().int().min(100).max(599).default(200),
	timeout: z
		.number()
		.int()
		.positive('Timeout must be greater than 0')
		.default(30000),
	interval: z
		.number()
		.int()
		.positive('Interval must be greater than 0')
		.default(300000), // 5 minutes
	collectionId: z.string().optional(),
	isActive: z.boolean().optional().default(false),
});

export const updateApiEndpointSchema = z.object({
	externalId: z.string().trim().optional(),
	name: z.string().trim().min(1, 'Endpoint name cannot be empty').optional(),
	pathTemplate: z.string().trim().optional(),
	requestPath: z.string().trim().optional(),
	method: HttpMethod.optional(),
	// Layered schema pattern
	bodySchema: z.string().trim().optional(),
	bodyOverrides: z.string().trim().optional(),
	headersSchema: z.record(z.string(), z.string()).optional(),
	headersOverrides: z.record(z.string(), z.string()).optional(),
	querySchema: z.record(z.string(), z.string()).optional(),
	queryOverrides: z.record(z.string(), z.string()).optional(),
	// Legacy fields (kept for backwards compatibility)
	headers: z.record(z.string(), z.string()).optional(),
	body: z.string().trim().optional(),
	expectedStatus: z.number().int().min(100).max(599).optional(),
	timeout: z
		.number()
		.int()
		.positive('Timeout must be greater than 0')
		.optional(),
	interval: z
		.number()
		.int()
		.positive('Interval must be greater than 0')
		.optional(),
	isActive: z.boolean().optional(),
});

export const getApiEndpointSchema = z.object({
	id: z.string().trim().min(1, 'Endpoint ID is required'),
});

export const deleteApiEndpointSchema = z.object({
	id: z.string().trim().min(1, 'Endpoint ID is required'),
});

export const getOrganizationEndpointsSchema = z.object({
	organizationId: z.string().trim().min(1, 'Organization ID is required'),
});

// Environment schemas
export const environmentVariableSchema = z.object({
	key: z.string().trim().min(1, 'Variable name is required'),
	value: z.string(),
	description: z.string().optional(),
	enabled: z.boolean().optional().default(true),
});

export const createEnvironmentSchema = z.object({
	name: z.string().trim().min(1, 'Environment name is required'),
	variables: z.array(environmentVariableSchema).default([]),
	isDefault: z.boolean().optional(),
});

export const updateEnvironmentSchema = z.object({
	id: z.string().trim().min(1, 'Environment ID is required'),
	name: z.string().trim().min(1, 'Environment name is required').optional(),
	variables: z.array(environmentVariableSchema).optional(),
	isDefault: z.boolean().optional(),
});

export const deleteEnvironmentSchema = z.object({
	id: z.string().trim().min(1, 'Environment ID is required'),
});

// Export types inferred from schemas
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type GetCollectionInput = z.infer<typeof getCollectionSchema>;
export type DeleteCollectionInput = z.infer<typeof deleteCollectionSchema>;
export type DuplicateCollectionInput = z.infer<typeof duplicateCollectionSchema>;
export type SearchCollectionsInput = z.infer<typeof searchCollectionsSchema>;

export type CreateApiEndpointInput = z.infer<typeof createApiEndpointSchema>;
export type UpdateApiEndpointInput = z.infer<typeof updateApiEndpointSchema>;
export type GetApiEndpointInput = z.infer<typeof getApiEndpointSchema>;
export type DeleteApiEndpointInput = z.infer<typeof deleteApiEndpointSchema>;
export type GetOrganizationEndpointsInput = z.infer<typeof getOrganizationEndpointsSchema>;

export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
export type DeleteEnvironmentInput = z.infer<typeof deleteEnvironmentSchema>;
