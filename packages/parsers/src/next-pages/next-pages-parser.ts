/**
 * Next.js Pages Router parser with AST-based detection
 * Parses routes from the /pages/api directory
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Node, Project, SourceFile, SyntaxKind } from 'ts-morph';

import { logger } from '../lib/logger';
import type { ParsedRoute } from '../lib/types';
import type { HttpMethod } from '../lib/constants';

import {
	isTRPCHandler,
	extractDynamicSegments,
	convertDynamicSegments,
	normalizeRoutePath,
	hasMiddleware,
	shouldIncludeBody,
	extractBodyFromHandler,
	analyzeHandler,
	extractMethodLiteral,
	type DebugLogger,
} from '../shared/next-shared';
import {
	createDebugLogger,
	findTsConfig,
	hasWorkspaceDependency,
} from '../shared/parser-utils';
import { extractBodyFromSchema } from '../shared/zod-schema-parser';

/**
 * Next.js Pages Router route type
 */
type NextPagesRouteType = 'pages-router';

/**
 * Parsed Next.js Pages Router handler with metadata
 */
interface NextPagesRouteHandler {
	path: string;
	method: HttpMethod;
	file: string;
	line: number;
	type: NextPagesRouteType;
	isDynamic: boolean;
	dynamicSegments: string[];
	hasMiddleware: boolean;
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
 * Detect if current workspace has Next.js with Pages Router
 */
export async function hasNextPages(): Promise<boolean> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return false;
		}
		const rootDir = workspaceFolders[0].uri.fsPath;
		const hasNext = hasWorkspaceDependency(rootDir, ["next"]);
		if (hasNext) {
			logger.info('Detected Next.js Pages Router project');
		}
		return hasNext;
	} catch (error) {
		logger.error('Failed to detect Next.js', error);
		return false;
	}
}

/**
 * Detect if file is a Pages Router API file
 */
function isPagesRouterFile(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.includes('/pages/api/') && !normalized.endsWith('/route.ts') && !normalized.endsWith('/route.js');
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

	// Pages Router: pages/api/users/[id].ts -> /api/users/:id
	let routePath = relativePath
		.replace(/^(src\/)?pages/, '')
		.replace(/\.(ts|js)$/, '')
		.replace(/\/index$/, '');

	if (!routePath) {
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
 * Detect Pages Router handler pattern
 */
function detectPagesRouterHandler(sourceFile: SourceFile, debug: DebugLogger): Node | null {
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
 * Collect request parameter names from handler
 */
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

/**
 * Check if node is a request method expression (req.method)
 */
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
		const literal = extractMethodLiteral(element);
		if (literal && !methods.includes(literal)) {
			methods.push(literal);
		}
	});

	return methods;
}

/**
 * Detect HTTP methods used in Pages Router handler
 */
function detectPagesRouterMethods(handler: Node, debug: DebugLogger): HttpMethod[] {
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

	return Array.from(methods);
}

/**
 * Parse Pages Router API route file
 */
function parsePagesRouterFile(
	sourceFile: SourceFile,
	rootDir: string,
	debug: DebugLogger,
): NextPagesRouteHandler[] {
	const handlers: NextPagesRouteHandler[] = [];
	const filePath = sourceFile.getFilePath();

	const { routePath, dynamicSegments } = extractRoutePath(filePath, rootDir, debug);
	const normalizedPath = normalizeRoutePath(routePath);

	const handler = detectPagesRouterHandler(sourceFile, debug);
	if (!handler) {
		debug(`No handler found in Pages Router file: ${filePath}`);
		return handlers;
	}

	const methods = detectPagesRouterMethods(handler, debug);
	const analysis = analyzeHandler(
		handler,
		debug,
		(h, d) => extractBodyFromHandler(h, d, extractBodyFromSchema),
	);

	const middleware = hasMiddleware(sourceFile);

	methods.forEach((method) => {
		handlers.push({
			path: normalizedPath,
			method,
			file: path.relative(rootDir, filePath),
			line: handler.getStartLineNumber(),
			type: 'pages-router',
			isDynamic: dynamicSegments.length > 0,
			dynamicSegments: dynamicSegments.map((s) => s.name),
			hasMiddleware: middleware,
			...analysis,
		});

		debug(
			`Found Pages Router ${method} handler at ${normalizedPath} (line ${handler.getStartLineNumber()})`,
		);
	});

	return handlers;
}

/**
 * Convert NextPagesRouteHandler to ParsedRoute
 */
function convertToRoutes(
	handlers: NextPagesRouteHandler[],
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
			type: 'nextjs-page' as const,
			headers: Object.keys(handler.headers).length > 0 ? handler.headers : undefined,
			query: handler.queryParams,
			body: effectiveBody,
		};
	});
}

/**
 * Parse all Next.js Pages Router routes using AST analysis
 */
export async function parseNextPagesRoutes(): Promise<ParsedRoute[]> {
	try {
		logger.debug('Parsing Next.js Pages Router routes with AST');
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			logger.warn('No workspace folders found');
			return [];
		}

		const rootDir = workspaceFolders[0].uri.fsPath;
		const debug = createDebugLogger("next-pages:parser", true);

		const tsconfigPath = findTsConfig(rootDir);
		if (!tsconfigPath) {
			logger.warn('No tsconfig.json found, cannot parse routes without AST');
			return [];
		}

		const project = new Project({
			tsConfigFilePath: tsconfigPath,
			skipAddingFilesFromTsConfig: false,
		});

		debug(`Using tsconfig at ${tsconfigPath}`);

		// Add Pages Router files
		const pagesRouterPattern = path.join(rootDir, '**/pages/api/**/*.{ts,js}');
		try {
			project.addSourceFilesAtPaths(pagesRouterPattern);
			debug(`Added Pages Router files: ${pagesRouterPattern}`);
		} catch (error) {
			debug(`Failed to add Pages Router files: ${error}`);
		}

		const sourceFiles = project
			.getSourceFiles()
			.filter((file: SourceFile) => file.getFilePath().startsWith(rootDir));

		debug(`Found ${sourceFiles.length} route file(s)`);

		const routeHandlers: NextPagesRouteHandler[] = [];

		for (const file of sourceFiles) {
			const filePath = file.getFilePath();
			debug(`Scanning file ${path.relative(rootDir, filePath)}`);

			if (isTRPCHandler(file)) {
				debug(`Skipping tRPC handler: ${path.relative(rootDir, filePath)}`);
				continue;
			}

			if (isPagesRouterFile(filePath)) {
				const handlers = parsePagesRouterFile(file, rootDir, debug);
				routeHandlers.push(...handlers);
			}
		}

		const routes = convertToRoutes(routeHandlers, rootDir);

		logger.info(`Parsed ${routes.length} Next.js Pages Router routes using AST`);
		return routes;
	} catch (error) {
		logger.error('Failed to parse Next.js Pages Router routes with AST', error);
		return [];
	}
}

