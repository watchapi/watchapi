/**
 * Next.js App Router parser with AST-based detection
 * Parses routes from the /app directory (route.ts files)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Node, Project, SourceFile } from 'ts-morph';

import { logger } from '../lib/logger';
import type { ParsedRoute } from '../lib/types';
import type { HttpMethod } from '../lib/constants';

import {
	isTRPCHandler,
	extractDynamicSegments,
	convertDynamicSegments,
	normalizeRoutePath,
	hasMiddleware,
	isServerAction,
	shouldIncludeBody,
	extractBodyFromHandler,
	analyzeHandler,
	NEXTJS_HTTP_METHODS,
	type DebugLogger,
} from '../shared/next-shared';
import {
	createDebugLogger,
	findTsConfig,
	hasWorkspaceDependency,
} from '../shared/parser-utils';
import { extractBodyFromSchema } from '../shared/zod-schema-parser';

/**
 * Next.js App Router route type
 */
type NextAppRouteType = 'app-router';

/**
 * Parsed Next.js App Router handler with metadata
 */
interface NextAppRouteHandler {
	path: string;
	method: HttpMethod;
	file: string;
	line: number;
	type: NextAppRouteType;
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
	bodyExample?: string;
}

/**
 * Route detection result
 */
interface RouteDetectionResult {
	routePath: string;
	dynamicSegments: { name: string; isCatchAll: boolean; isOptional: boolean }[];
}

const routePathCache = new Map<string, RouteDetectionResult>();

/**
 * Detect if current workspace has Next.js
 */
export async function hasNextApp(): Promise<boolean> {
	try {
		const hasNext = await hasWorkspaceDependency(["next"]);
		if (hasNext) {
			logger.info('Detected Next.js App Router project');
		}
		return hasNext;
	} catch (error) {
		logger.error('Failed to detect Next.js', error);
		return false;
	}
}

/**
 * Detect if file is an App Router route file
 */
function isAppRouterFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return (
		normalized.includes('/app/') &&
		(normalized.endsWith('/route.ts') || normalized.endsWith('/route.js'))
	);
}

/**
 * Extract route path from file path
 */
function extractRoutePath(
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
	debug(`Extracting route path from: ${relativePath}`);

	// App Router: app/api/users/[id]/route.ts -> /api/users/:id
	let routePath = relativePath
		.replace(/^(src\/)?app/, '')
		.replace(/\/route\.(ts|js)$/, '')
		.replace(/^\//, '');

	// Ensure routes start with /
	if (routePath !== '') {
		routePath = '/' + routePath;
	} else {
		routePath = '/';
	}

	// Extract dynamic segments
	const dynamicSegments = extractDynamicSegments(routePath);

	// Convert [param] to :param
	routePath = convertDynamicSegments(routePath);

	debug(`Extracted route path: ${routePath}`);

	const result = {
		routePath,
		dynamicSegments,
	};
	routePathCache.set(cacheKey, result);
	return result;
}

/**
 * Collect exported HTTP method handlers from source file
 */
function collectHttpMethodHandlers(
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
		if (name && NEXTJS_HTTP_METHODS.includes(name as HttpMethod)) {
			debug(`Found exported ${name} handler`);
			handlers.set(name as HttpMethod, func);
		}
	});

	// Find all exported variable declarations with arrow functions
	sourceFile.getVariableDeclarations().forEach((decl) => {
		const name = decl.getName();
		if (!NEXTJS_HTTP_METHODS.includes(name as HttpMethod)) {
			return;
		}

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
		if (!NEXTJS_HTTP_METHODS.includes(name as HttpMethod)) {
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
 * Detect exported methods array pattern
 */
function detectExportedMethods(
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
		if (Node.isStringLiteral(element) || Node.isNoSubstitutionTemplateLiteral(element)) {
			const value = element.getLiteralValue().toUpperCase();
			if (NEXTJS_HTTP_METHODS.includes(value as HttpMethod) && !methods.includes(value as HttpMethod)) {
				methods.push(value as HttpMethod);
			}
		}
	});

	return methods;
}

/**
 * Parse App Router route file
 */
function parseAppRouterFile(
	sourceFile: SourceFile,
	rootDir: string,
	debug: DebugLogger,
): NextAppRouteHandler[] {
	const handlers: NextAppRouteHandler[] = [];
	const filePath = sourceFile.getFilePath();

	const { routePath, dynamicSegments } = extractRoutePath(filePath, rootDir, debug);
	const normalizedPath = normalizeRoutePath(routePath);

	const methodHandlers = collectHttpMethodHandlers(sourceFile, debug);
	const exportedMethods = detectExportedMethods(sourceFile, debug);
	const methodSet = new Set<HttpMethod>([
		...methodHandlers.keys(),
		...exportedMethods,
	]);

	const middleware = hasMiddleware(sourceFile);
	const serverAction = isServerAction(sourceFile);

	methodSet.forEach((method) => {
		const handler = methodHandlers.get(method) ?? sourceFile;
		const analysis = analyzeHandler(
			handler,
			debug,
			(h, d) => extractBodyFromHandler(h, d, extractBodyFromSchema),
		);

		handlers.push({
			path: normalizedPath,
			method,
			file: path.relative(rootDir, filePath),
			line: handler.getStartLineNumber(),
			type: 'app-router',
			isDynamic: dynamicSegments.length > 0,
			dynamicSegments: dynamicSegments.map((s) => s.name),
			hasMiddleware: middleware,
			isServerAction: serverAction,
			...analysis,
		});

		debug(
			`Found App Router ${method} handler at ${normalizedPath} (line ${handler.getStartLineNumber()})`,
		);
	});

	return handlers;
}

/**
 * Convert NextAppRouteHandler to ParsedRoute
 */
function convertToRoutes(
	handlers: NextAppRouteHandler[],
	rootDir: string,
): ParsedRoute[] {
	return handlers.map((handler) => {
		const name = `${handler.method} ${handler.path}`;

		const effectiveBody = handler.bodyExample && shouldIncludeBody(handler.method)
			? handler.bodyExample
			: undefined;

		return {
			name,
			path: handler.path,
			method: handler.method,
			filePath: path.join(rootDir, handler.file),
			type: 'nextjs-app' as const,
			headers: Object.keys(handler.headers).length > 0 ? handler.headers : undefined,
			query: handler.queryParams,
			body: effectiveBody,
		};
	});
}

/**
 * Parse all Next.js App Router routes using AST analysis
 */
export async function parseNextAppRoutes(): Promise<ParsedRoute[]> {
	try {
		logger.debug('Parsing Next.js App Router routes with AST');
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			logger.warn('No workspace folders found');
			return [];
		}

		const rootDir = workspaceFolders[0].uri.fsPath;
		const debug = createDebugLogger("next-app:parser", true);

		const tsconfigPath = await findTsConfig(rootDir);
		if (!tsconfigPath) {
			logger.warn('No tsconfig.json found, cannot parse routes without AST');
			return [];
		}

		const project = new Project({
			tsConfigFilePath: tsconfigPath,
			skipAddingFilesFromTsConfig: false,
		});

		debug(`Using tsconfig at ${tsconfigPath}`);

		// Add App Router files
		const appRouterPattern = path.join(rootDir, '**/app/**/route.{ts,js}');
		try {
			project.addSourceFilesAtPaths(appRouterPattern);
			debug(`Added App Router files: ${appRouterPattern}`);
		} catch (error) {
			debug(`Failed to add App Router files: ${error}`);
		}

		const sourceFiles = project
			.getSourceFiles()
			.filter((file: SourceFile) => file.getFilePath().startsWith(rootDir));

		debug(`Found ${sourceFiles.length} route file(s)`);

		const routeHandlers: NextAppRouteHandler[] = [];

		for (const file of sourceFiles) {
			const filePath = file.getFilePath();
			debug(`Scanning file ${path.relative(rootDir, filePath)}`);

			if (isTRPCHandler(file)) {
				debug(`Skipping tRPC handler: ${path.relative(rootDir, filePath)}`);
				continue;
			}

			if (isAppRouterFile(filePath)) {
				const handlers = parseAppRouterFile(file, rootDir, debug);
				routeHandlers.push(...handlers);
			}
		}

		const routes = convertToRoutes(routeHandlers, rootDir);

		logger.info(`Parsed ${routes.length} Next.js App Router routes using AST`);
		return routes;
	} catch (error) {
		logger.error('Failed to parse Next.js App Router routes with AST', error);
		return [];
	}
}

