/**
 * tRPC parser types
 */

export type ProcedureMethod = 'query' | 'mutation';
export type ProcedureVisibility = 'public' | 'private' | 'protected' | 'admin' | 'unknown';

/**
 * Parsed tRPC procedure node with metadata
 */
export interface TrpcProcedureNode {
	router: string;
	procedure: string;
	method: ProcedureMethod;
	input: boolean;
	output: boolean;
	file: string;
	line: number;
	procedureType: ProcedureVisibility;
	resolverLines: number;
	usesDb: boolean;
	hasErrorHandling: boolean;
	hasSideEffects: boolean;
	headers: Record<string, string>;
	queryParams?: Record<string, string>;
	bodyExample?: string;
}

/**
 * tRPC router metadata
 */
export interface TrpcRouterMeta {
	name: string;
	file: string;
	line: number;
	linesOfCode: number;
}

/**
 * Router mount edge for composition tracking
 */
export interface RouterMountEdge {
	parent: string;
	property: string;
	target: string;
}

/**
 * Debug logger function type
 */
export type DebugLogger = (message: string) => void;

/**
 * Router parse result
 */
export interface RouterParseResult {
	nodes: TrpcProcedureNode[];
	routerMeta: TrpcRouterMeta;
}

/**
 * Resolver analysis result
 */
export interface ResolverAnalysis {
	resolverLines: number;
	usesDb: boolean;
	hasErrorHandling: boolean;
	hasSideEffects: boolean;
	headers: Record<string, string>;
}
