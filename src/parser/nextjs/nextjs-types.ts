/**
 * Next.js parser types
 */

import type { HttpMethod } from '@/shared/constants';

/**
 * Next.js route type
 */
export type NextJsRouteType = 'app-router' | 'pages-router' | 'api-route';

/**
 * Parsed Next.js route handler with metadata
 */
export interface NextJsRouteHandler {
	path: string;
	method: HttpMethod;
	file: string;
	line: number;
	type: NextJsRouteType;
	isDynamic: boolean;
	dynamicSegments: string[];
	hasMiddleware: boolean;
	isServerAction: boolean;
	handlerLines: number;
	usesDb: boolean;
	hasErrorHandling: boolean;
	hasValidation: boolean;
	headers: Record<string, string>;
	queryParams?: Record<string, string>;
}

/**
 * Route file metadata
 */
export interface NextJsRouteFile {
	filePath: string;
	routePath: string;
	type: NextJsRouteType;
	handlers: NextJsRouteHandler[];
	exports: string[];
}

/**
 * Dynamic route segment
 */
export interface DynamicSegment {
	name: string;
	isCatchAll: boolean;
	isOptional: boolean;
}

/**
 * Debug logger function type
 */
export type DebugLogger = (message: string) => void;

/**
 * Handler analysis result
 */
export interface HandlerAnalysis {
	handlerLines: number;
	usesDb: boolean;
	hasErrorHandling: boolean;
	hasValidation: boolean;
	headers: Record<string, string>;
	queryParams?: Record<string, string>;
}

/**
 * Route detection result
 */
export interface RouteDetectionResult {
	isAppRouter: boolean;
	isPagesRouter: boolean;
	routePath: string;
	dynamicSegments: DynamicSegment[];
}
