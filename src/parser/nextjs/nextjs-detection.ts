/**
 * Next.js route detection utilities
 */

import * as path from 'path';
import { Node, SourceFile, SyntaxKind } from 'ts-morph';
import {
	APP_ROUTER_METHODS,
	DYNAMIC_SEGMENT_REGEX,
	CATCH_ALL_REGEX,
	OPTIONAL_CATCH_ALL_REGEX,
	RESERVED_SEGMENTS,
} from './nextjs-constants';
import type { DynamicSegment, RouteDetectionResult, DebugLogger } from './nextjs-types';
import type { HttpMethod } from '@/shared/constants';

const routePathCache = new Map<string, RouteDetectionResult>();

/**
 * Detect if file is an App Router route file
 */
export function isAppRouterFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.includes('/app/') && normalized.endsWith('/route.ts') || normalized.endsWith('/route.js');
}

/**
 * Detect if file is a Pages Router API file
 */
export function isPagesRouterFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.includes('/pages/api/') && !normalized.endsWith('/route.ts') && !normalized.endsWith('/route.js');
}

/**
 * Detect if source file is a tRPC handler by analyzing code patterns
 * This checks for tRPC-specific imports and handler functions
 */
export function isTRPCHandler(sourceFile: SourceFile): boolean {
	const text = sourceFile.getText();

	// Check for tRPC imports
	const hasTRPCImport = /@trpc\/server|fetchRequestHandler|createNextApiHandler/.test(text);
	if (!hasTRPCImport) {
		return false;
	}

	// Check for tRPC handler patterns
	const hasTRPCHandler = /fetchRequestHandler|createNextApiHandler/.test(text);

	return hasTRPCHandler;
}

/**
 * Extract route path from file path
 */
export function extractRoutePath(
	filePath: string,
	rootDir: string,
	debug: DebugLogger,
): RouteDetectionResult {
	const cacheKey = `${rootDir}::${filePath}`;
	const cached = routePathCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
	let routePath = '';
	let isAppRouter = false;
	let isPagesRouter = false;

	debug(`Extracting route path from: ${relativePath}`);

	if (isAppRouterFile(filePath)) {
		// App Router: app/api/users/[id]/route.ts -> /api/users/:id
		isAppRouter = true;
		routePath = relativePath
			.replace(/^(src\/)?app/, '')
			.replace(/\/route\.(ts|js)$/, '')
			.replace(/^\//, '');

		// Ensure API routes start with /api
		if (!routePath.startsWith('api/') && routePath !== '') {
			routePath = routePath;
		} else {
			routePath = '/' + routePath;
		}
	} else if (isPagesRouterFile(filePath)) {
		// Pages Router: pages/api/users/[id].ts -> /api/users/:id
		isPagesRouter = true;
		routePath = relativePath
			.replace(/^(src\/)?pages/, '')
			.replace(/\.(ts|js)$/, '')
			.replace(/\/index$/, '');

		if (!routePath) {
			routePath = '/';
		}
	}

	// Extract dynamic segments
	const dynamicSegments = extractDynamicSegments(routePath);

	// Convert [param] to :param
	routePath = convertDynamicSegments(routePath);

	debug(`Extracted route path: ${routePath} (App: ${isAppRouter}, Pages: ${isPagesRouter})`);

	const result = {
		isAppRouter,
		isPagesRouter,
		routePath,
		dynamicSegments,
	};
	routePathCache.set(cacheKey, result);
	return result;
}

/**
 * Extract dynamic segments from route path
 */
export function extractDynamicSegments(routePath: string): DynamicSegment[] {
	const segments: DynamicSegment[] = [];
	const matches = routePath.matchAll(DYNAMIC_SEGMENT_REGEX);

	for (const match of matches) {
		const fullMatch = match[0];
		const paramName = match[1];

		// Check for optional catch-all: [[...slug]]
		if (OPTIONAL_CATCH_ALL_REGEX.test(fullMatch)) {
			const optMatch = fullMatch.match(OPTIONAL_CATCH_ALL_REGEX);
			if (optMatch) {
				segments.push({
					name: optMatch[1],
					isCatchAll: true,
					isOptional: true,
				});
			}
			continue;
		}

		// Check for catch-all: [...slug]
		if (CATCH_ALL_REGEX.test(fullMatch)) {
			const catchMatch = fullMatch.match(CATCH_ALL_REGEX);
			if (catchMatch) {
				segments.push({
					name: catchMatch[1],
					isCatchAll: true,
					isOptional: false,
				});
			}
			continue;
		}

		// Regular dynamic segment: [id]
		segments.push({
			name: paramName,
			isCatchAll: false,
			isOptional: false,
		});
	}

	return segments;
}

/**
 * Convert Next.js dynamic segments to Express-style params
 */
export function convertDynamicSegments(routePath: string): string {
	return routePath
		.replace(/\[\[\.\.\.([^\]]+)\]\]/g, ':$1*?') // Optional catch-all
		.replace(/\[\.\.\.([^\]]+)\]/g, ':$1*') // Catch-all
		.replace(/\[([^\]]+)\]/g, ':$1'); // Regular param
}

/**
 * Collect exported HTTP method handlers from source file
 */
export function collectHttpMethodHandlers(
	sourceFile: SourceFile,
	debug: DebugLogger,
): Map<HttpMethod, Node> {
	const handlers = new Map<HttpMethod, Node>();

	// Find all exported function declarations
	sourceFile.getFunctions().forEach((func) => {
		if (!func.isExported()) {
			return;
		}

		const name = func.getName();
		if (name && APP_ROUTER_METHODS.includes(name as HttpMethod)) {
			debug(`Found exported ${name} handler`);
			handlers.set(name as HttpMethod, func);
		}
	});

	// Find all exported variable declarations with arrow functions
	sourceFile.getVariableDeclarations().forEach((decl) => {
		const name = decl.getName();
		if (!APP_ROUTER_METHODS.includes(name as HttpMethod)) {
			return;
		}

		// Check if it's exported
		const statement = decl.getVariableStatement();
		if (statement?.isExported()) {
			const initializer = decl.getInitializer();
			if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
				debug(`Found exported ${name} handler (arrow/function expression)`);
				handlers.set(name as HttpMethod, initializer);
			}
		}
	});

	// Find named exports
	sourceFile.getExportedDeclarations().forEach((declarations, name) => {
		if (!APP_ROUTER_METHODS.includes(name as HttpMethod)) {
			return;
		}

		declarations.forEach((decl) => {
			if (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
				debug(`Found named export ${name} handler`);
				handlers.set(name as HttpMethod, decl);
			}
		});
	});

	return handlers;
}

/**
 * Detect Pages Router handler pattern
 */
export function detectPagesRouterHandler(sourceFile: SourceFile, debug: DebugLogger): Node | null {
	// Look for default export
	const defaultExport = sourceFile.getDefaultExportSymbol();
	if (defaultExport) {
		const declarations = defaultExport.getDeclarations();
		if (declarations.length > 0) {
			debug('Found default export handler');
			return declarations[0];
		}
	}

	// Look for named export 'handler'
	const handlerExport = sourceFile.getExportedDeclarations().get('handler');
	if (handlerExport && handlerExport.length > 0) {
		debug('Found named handler export');
		return handlerExport[0];
	}

	return null;
}

/**
 * Detect HTTP methods used in Pages Router handler
 */
export function detectPagesRouterMethods(handler: Node, debug: DebugLogger): HttpMethod[] {
	const methods = new Set<HttpMethod>();
	const sourceFile = handler.getSourceFile();
	const reqParamNames = collectReqParamNames(handler);

	const exportedMethods = detectExportedMethods(sourceFile, debug);
	exportedMethods.forEach((method) => methods.add(method));

	handler.forEachDescendant((node) => {
		if (Node.isBinaryExpression(node)) {
			const operator = node.getOperatorToken().getKind();
			if (
				operator !== SyntaxKind.EqualsEqualsEqualsToken &&
				operator !== SyntaxKind.EqualsEqualsToken
			) {
				return;
			}

			const left = node.getLeft();
			const right = node.getRight();

			const leftMethod = extractMethodLiteral(left);
			const rightMethod = extractMethodLiteral(right);

			if (isReqMethodExpression(left, reqParamNames) && rightMethod) {
				debug(`Detected ${rightMethod} method in handler`);
				methods.add(rightMethod);
				return;
			}

			if (isReqMethodExpression(right, reqParamNames) && leftMethod) {
				debug(`Detected ${leftMethod} method in handler`);
				methods.add(leftMethod);
			}
		}

		if (Node.isSwitchStatement(node)) {
			const expression = node.getExpression();
			if (!isReqMethodExpression(expression, reqParamNames)) {
				return;
			}

			node.getCaseBlock().getClauses().forEach((clause) => {
				if (!Node.isCaseClause(clause)) {
					return;
				}
				const literal = extractMethodLiteral(clause.getExpression());
				if (literal) {
					debug(`Detected ${literal} method in switch case`);
					methods.add(literal);
				}
			});
		}
	});

	const detected = Array.from(methods);

	// If no specific methods found, default to GET
	if (detected.length === 0) {
		debug('No specific methods found, defaulting to GET');
		return ['GET'];
	}

	return detected;
}

/**
 * Check if handler uses middleware
 */
export function hasMiddleware(sourceFile: SourceFile): boolean {
	const text = sourceFile.getText();
	return /middleware|NextRequest|authenticate|authorize|auth\(/.test(text);
}

/**
 * Check if file is a Server Action
 */
export function isServerAction(sourceFile: SourceFile): boolean {
	const text = sourceFile.getText();
	return text.includes("'use server'") || text.includes('"use server"');
}

/**
 * Normalize route path
 */
export function normalizeRoutePath(routePath: string): string {
	// Remove trailing slashes except for root
	if (routePath !== '/' && routePath.endsWith('/')) {
		routePath = routePath.slice(0, -1);
	}

	// Ensure leading slash
	if (!routePath.startsWith('/')) {
		routePath = '/' + routePath;
	}

	return routePath;
}

export function detectExportedMethods(
	sourceFile: SourceFile,
	debug: DebugLogger,
): HttpMethod[] {
	const methods = new Set<HttpMethod>();

	sourceFile.getVariableDeclarations().forEach((decl) => {
		if (decl.getName() !== 'methods') {
			return;
		}

		const statement = decl.getVariableStatement();
		if (!statement?.isExported()) {
			return;
		}

		const initializer = decl.getInitializer();
		const found = extractMethodsFromExpression(initializer, sourceFile);
		found.forEach((method) => methods.add(method));
	});

	if (methods.size > 0) {
		debug(`Detected exported methods array: ${Array.from(methods).join(', ')}`);
	}

	return Array.from(methods);
}

function extractMethodsFromExpression(
	node: Node | undefined,
	sourceFile: SourceFile,
): HttpMethod[] {
	if (!node) {
		return [];
	}

	if (Node.isAsExpression(node) || Node.isTypeAssertion(node) || Node.isParenthesizedExpression(node)) {
		return extractMethodsFromExpression(node.getExpression(), sourceFile);
	}

	if (Node.isIdentifier(node)) {
		const declaration = sourceFile.getVariableDeclaration(node.getText());
		if (declaration) {
			return extractMethodsFromExpression(declaration.getInitializer(), sourceFile);
		}
	}

	if (!Node.isArrayLiteralExpression(node)) {
		return [];
	}

	const methods: HttpMethod[] = [];
	node.getElements().forEach((element) => {
		const literal = extractMethodLiteral(element);
		if (literal && !methods.includes(literal)) {
			methods.push(literal);
		}
	});

	return methods;
}

function extractMethodLiteral(node: Node): HttpMethod | null {
	if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
		const value = node.getLiteralValue().toUpperCase();
		if (APP_ROUTER_METHODS.includes(value as HttpMethod)) {
			return value as HttpMethod;
		}
	}

	return null;
}

function collectReqParamNames(handler: Node): Set<string> {
	const names = new Set<string>(['req', 'request']);

	if (
		Node.isFunctionDeclaration(handler) ||
		Node.isFunctionExpression(handler) ||
		Node.isArrowFunction(handler)
	) {
		const parameters = handler.getParameters();
		if (parameters.length > 0) {
			const first = parameters[0];
			if (Node.isIdentifier(first.getNameNode())) {
				names.add(first.getName());
			}
		}
	}

	return names;
}

function isReqMethodExpression(node: Node, reqParamNames: Set<string>): boolean {
	if (!Node.isPropertyAccessExpression(node)) {
		return false;
	}

	if (node.getName() !== 'method') {
		return false;
	}

	const expression = node.getExpression();
	if (!Node.isIdentifier(expression)) {
		return false;
	}

	return reqParamNames.has(expression.getText());
}

/**
 * Check if segment is reserved
 */
export function isReservedSegment(segment: string): boolean {
	return RESERVED_SEGMENTS.has(segment);
}
