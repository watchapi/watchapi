/**
 * Next.js route parser with AST-based detection
 * Provides deterministic and accurate parsing of Next.js routes
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Node, Project, SourceFile } from 'ts-morph';

import { logger } from '@/shared/logger';
import { FILE_PATTERNS } from '@/shared/constants';
import type { ParsedRoute } from '@/shared/types';
import type { HttpMethod } from '@/shared/constants';

import { DB_PATTERNS, VALIDATION_PATTERNS, ERROR_PATTERNS } from './nextjs-constants';
import {
	isAppRouterFile,
	isPagesRouterFile,
	isTRPCHandler,
	extractRoutePath,
	collectHttpMethodHandlers,
	detectExportedMethods,
	detectPagesRouterHandler,
	detectPagesRouterMethods,
	hasMiddleware,
	isServerAction,
	normalizeRoutePath,
} from './nextjs-detection';
import type { NextJsRouteHandler, DebugLogger, HandlerAnalysis } from './nextjs-types';

/**
 * Detect if current workspace has Next.js
 */
export async function hasNextJs(): Promise<boolean> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			return false;
		}

		// Check for package.json with next dependency
		for (const folder of workspaceFolders) {
			const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json');
			try {
				const content = await vscode.workspace.fs.readFile(packageJsonUri);
				const packageJson = JSON.parse(content.toString());

				if (
					packageJson.dependencies?.next ||
					packageJson.devDependencies?.next
				) {
					logger.info('Detected Next.js project');
					return true;
				}
			} catch {
				// Continue to next workspace folder
			}
		}

		return false;
	} catch (error) {
		logger.error('Failed to detect Next.js', error);
		return false;
	}
}

/**
 * Parse all Next.js routes using AST analysis
 */
export async function parseAllNextJsRoutes(): Promise<ParsedRoute[]> {
	try {
		logger.debug('Parsing Next.js routes with AST');
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			logger.warn('No workspace folders found');
			return [];
		}

		const rootDir = workspaceFolders[0].uri.fsPath;
		const debug = createDebugLogger(true); // Enable debug logging

		// Find tsconfig.json
		const tsconfigPath = await findTsConfig(rootDir);
		if (!tsconfigPath) {
			logger.warn('No tsconfig.json found, falling back to basic parsing');
			return await parseAllNextJsRoutesBasic();
		}

		// Initialize ts-morph project
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

		const routeHandlers: NextJsRouteHandler[] = [];

		// Parse each file
		for (const file of sourceFiles) {
			const filePath = file.getFilePath();
			debug(`Scanning file ${path.relative(rootDir, filePath)}`);

			// Skip tRPC handler files
			if (isTRPCHandler(file)) {
				debug(`Skipping tRPC handler: ${path.relative(rootDir, filePath)}`);
				continue;
			}

			if (isAppRouterFile(filePath)) {
				const handlers = parseAppRouterFile(file, rootDir, debug);
				routeHandlers.push(...handlers);
			} else if (isPagesRouterFile(filePath)) {
				const handlers = parsePagesRouterFile(file, rootDir, debug);
				routeHandlers.push(...handlers);
			}
		}

		// Convert to ParsedRoute format
		const routes = convertToRoutes(routeHandlers, rootDir);

		logger.info(`Parsed ${routes.length} Next.js routes using AST`);
		return routes;
	} catch (error) {
		logger.error('Failed to parse Next.js routes with AST', error);
		// Fallback to basic parsing
		return await parseAllNextJsRoutesBasic();
	}
}

/**
 * Find tsconfig.json in workspace
 */
async function findTsConfig(rootDir: string): Promise<string | null> {
	const tsconfigPath = path.join(rootDir, 'tsconfig.json');
	try {
		const uri = vscode.Uri.file(tsconfigPath);
		await vscode.workspace.fs.stat(uri);
		return tsconfigPath;
	} catch {
		return null;
	}
}

/**
 * Parse App Router route file
 */
function parseAppRouterFile(
	sourceFile: SourceFile,
	rootDir: string,
	debug: DebugLogger,
): NextJsRouteHandler[] {
	const handlers: NextJsRouteHandler[] = [];
	const filePath = sourceFile.getFilePath();

	// Extract route path
	const { routePath, dynamicSegments } = extractRoutePath(filePath, rootDir, debug);
	const normalizedPath = normalizeRoutePath(routePath);

	// Collect HTTP method handlers
	const methodHandlers = collectHttpMethodHandlers(sourceFile, debug);
	const exportedMethods = detectExportedMethods(sourceFile, debug);
	const methodSet = new Set<HttpMethod>([
		...methodHandlers.keys(),
		...exportedMethods,
	]);

	// Check for middleware
	const middleware = hasMiddleware(sourceFile);
	const serverAction = isServerAction(sourceFile);

	// Create handler for each exported method
	methodSet.forEach((method) => {
		const handler = methodHandlers.get(method) ?? sourceFile;
		const analysis = analyzeHandler(handler);

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
 * Parse Pages Router API route file
 */
function parsePagesRouterFile(
	sourceFile: SourceFile,
	rootDir: string,
	debug: DebugLogger,
): NextJsRouteHandler[] {
	const handlers: NextJsRouteHandler[] = [];
	const filePath = sourceFile.getFilePath();

	// Extract route path
	const { routePath, dynamicSegments } = extractRoutePath(filePath, rootDir, debug);
	const normalizedPath = normalizeRoutePath(routePath);

	// Find handler
	const handler = detectPagesRouterHandler(sourceFile, debug);
	if (!handler) {
		debug(`No handler found in Pages Router file: ${filePath}`);
		return handlers;
	}

	// Detect HTTP methods
	const methods = detectPagesRouterMethods(handler, debug);
	const analysis = analyzeHandler(handler);

	// Check for middleware
	const middleware = hasMiddleware(sourceFile);

	// Create handler for each detected method
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
			isServerAction: false,
			...analysis,
		});

		debug(
			`Found Pages Router ${method} handler at ${normalizedPath} (line ${handler.getStartLineNumber()})`,
		);
	});

	return handlers;
}

/**
 * Analyze handler implementation
 */
function analyzeHandler(handler: Node): HandlerAnalysis {
	const handlerText = handler.getText();
	let handlerLines = 0;

	if (
		Node.isFunctionDeclaration(handler) ||
		Node.isArrowFunction(handler) ||
		Node.isFunctionExpression(handler)
	) {
		handlerLines =
			handler.getEndLineNumber() - handler.getStartLineNumber() + 1;
	} else if (Node.isVariableDeclaration(handler)) {
		const initializer = handler.getInitializer();
		if (initializer) {
			handlerLines =
				initializer.getEndLineNumber() - initializer.getStartLineNumber() + 1;
		}
	}

	const usesDb = DB_PATTERNS.test(handlerText);
	const hasErrorHandling = ERROR_PATTERNS.test(handlerText);
	const hasValidation = VALIDATION_PATTERNS.test(handlerText);
	const headers = extractHeaders(handlerText);

	const queryParams = extractQueryParams(handlerText);

	return {
		handlerLines,
		usesDb,
		hasErrorHandling,
		hasValidation,
		headers,
		queryParams,
	};
}

/**
 * Extract deterministic headers from handler code
 */
function extractHeaders(handlerText: string): Record<string, string> {
	const headers: Record<string, string> = {};

	// Pattern 1: NextResponse.json(..., { headers: { 'Content-Type': 'application/json' } })
	// Pattern 2: new Response(..., { headers: { 'Content-Type': 'application/json' } })
	const nextResponsePattern = /headers:\s*\{([^}]+)\}/g;
	let match;
	while ((match = nextResponsePattern.exec(handlerText)) !== null) {
		const headersBlock = match[1];
		// Extract key-value pairs like 'Content-Type': 'application/json'
		const headerPairs = headersBlock.matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g);
		for (const pair of headerPairs) {
			headers[pair[1]] = pair[2];
		}
	}

	// Pattern 3: res.setHeader('Content-Type', 'application/json') - Pages Router
	const setHeaderPattern = /res\.setHeader\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g;
	while ((match = setHeaderPattern.exec(handlerText)) !== null) {
		headers[match[1]] = match[2];
	}

	// Pattern 4: headers().set('Content-Type', 'application/json') - App Router
	const headerSetPattern = /headers\(\)\.set\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/g;
	while ((match = headerSetPattern.exec(handlerText)) !== null) {
		headers[match[1]] = match[2];
	}

	// Default Content-Type if JSON response detected
	if (!headers['Content-Type'] && /NextResponse\.json|Response\.json|res\.json/.test(handlerText)) {
		headers['Content-Type'] = 'application/json';
	}

	return headers;
}

/**
 * Extract query parameters from handler code
 */
function extractQueryParams(handlerText: string): Record<string, string> | undefined {
	const queryParams: Record<string, string> = {};

	// Pattern 1: searchParams.get('key') - App Router
	const searchParamsGetPattern = /searchParams\.get\(['"]([^'"]+)['"]\)/g;
	let match;
	while ((match = searchParamsGetPattern.exec(handlerText)) !== null) {
		queryParams[match[1]] = "";
	}

	// Pattern 2: req.query.key or context.query.key - Pages Router
	const reqQueryPattern = /(?:req|context)\.query\.(\w+)/g;
	while ((match = reqQueryPattern.exec(handlerText)) !== null) {
		queryParams[match[1]] = "";
	}

	// Pattern 3: const { key } = searchParams - App Router destructuring
	const destructuringPattern = /const\s*\{([^}]+)\}\s*=\s*searchParams/g;
	while ((match = destructuringPattern.exec(handlerText)) !== null) {
		const keys = match[1].split(',').map(k => k.trim().split(':')[0].trim());
		keys.forEach(key => {
			if (key && !key.includes('...')) { // Skip rest parameters
				queryParams[key] = "";
			}
		});
	}

	// Pattern 4: const { key } = req.query or context.query - Pages Router destructuring
	const reqDestructuringPattern = /const\s*\{([^}]+)\}\s*=\s*(?:req|context)\.query/g;
	while ((match = reqDestructuringPattern.exec(handlerText)) !== null) {
		const keys = match[1].split(',').map(k => k.trim().split(':')[0].trim());
		keys.forEach(key => {
			if (key && !key.includes('...')) {
				queryParams[key] = "";
			}
		});
	}

	if (Object.keys(queryParams).length === 0) {
		return undefined;
	}

	return queryParams;
}

/**
 * Convert NextJsRouteHandler to ParsedRoute
 */
function convertToRoutes(
	handlers: NextJsRouteHandler[],
	rootDir: string,
): ParsedRoute[] {
	return handlers.map((handler) => {
		const name = `${handler.method} ${handler.path}`;
		const type =
			handler.type === 'app-router' ? 'nextjs-app' : 'nextjs-page';

		return {
			name,
			path: handler.path,
			method: handler.method,
			filePath: path.join(rootDir, handler.file),
			type,
			headers: Object.keys(handler.headers).length > 0 ? handler.headers : undefined,
			query: handler.queryParams,
		};
	});
}

/**
 * Create debug logger
 */
function createDebugLogger(verbose?: boolean): DebugLogger {
	return (message: string) => {
		if (!verbose) {
			return;
		}
		logger.debug(`[nextjs:parser] ${message}`);
	};
}

/**
 * Fallback to basic parsing without AST
 */
async function parseAllNextJsRoutesBasic(): Promise<ParsedRoute[]> {
	const [appRoutes, pageRoutes] = await Promise.all([
		parseAppRoutes(),
		parsePageRoutes(),
	]);

	return [...appRoutes, ...pageRoutes];
}

/**
 * Parse Next.js App Router routes (basic mode)
 */
export async function parseAppRoutes(): Promise<ParsedRoute[]> {
	try {
		logger.debug('Parsing Next.js App Router routes (basic mode)');
		const routes: ParsedRoute[] = [];

		// Find all route files
		const files = await vscode.workspace.findFiles(
			FILE_PATTERNS.NEXTJS_APP_ROUTES,
			'**/node_modules/**',
		);

		for (const file of files) {
			const parsedRoutes = await parseAppRouteFile(file);
			routes.push(...parsedRoutes);
		}

		logger.info(`Parsed ${routes.length} App Router routes (basic mode)`);
		return routes;
	} catch (error) {
		logger.error('Failed to parse App Router routes (basic mode)', error);
		return [];
	}
}

/**
 * Check if file content contains tRPC handler patterns
 */
function isTRPCHandlerContent(text: string): boolean {
	const hasTRPCImport = /@trpc\/server|fetchRequestHandler|createNextApiHandler/.test(text);
	if (!hasTRPCImport) {
		return false;
	}
	const hasTRPCHandler = /fetchRequestHandler|createNextApiHandler/.test(text);
	return hasTRPCHandler;
}

/**
 * Parse a single App Router route file (basic mode)
 */
async function parseAppRouteFile(uri: vscode.Uri): Promise<ParsedRoute[]> {
	try {
		const content = await vscode.workspace.fs.readFile(uri);
		const text = content.toString();

		// Skip tRPC handlers
		if (isTRPCHandlerContent(text)) {
			logger.debug(`Skipping tRPC handler: ${uri.fsPath}`);
			return [];
		}

		const routes: ParsedRoute[] = [];

		// Extract route path from file path
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!workspaceFolder) {
			return routes;
		}

		const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
		const routePath = extractAppRoutePath(relativePath);

		// Detect exported HTTP method handlers
		const methods: HttpMethod[] = [];
		if (text.match(/export\s+(async\s+)?function\s+GET/)) {
			methods.push('GET');
		}
		if (text.match(/export\s+(async\s+)?function\s+POST/)) {
			methods.push('POST');
		}
		if (text.match(/export\s+(async\s+)?function\s+PUT/)) {
			methods.push('PUT');
		}
		if (text.match(/export\s+(async\s+)?function\s+PATCH/)) {
			methods.push('PATCH');
		}
		if (text.match(/export\s+(async\s+)?function\s+DELETE/)) {
			methods.push('DELETE');
		}
		if (text.match(/export\s+(async\s+)?function\s+HEAD/)) {
			methods.push('HEAD');
		}
		if (text.match(/export\s+(async\s+)?function\s+OPTIONS/)) {
			methods.push('OPTIONS');
		}

		// Create a route for each method
		for (const method of methods) {
			routes.push({
				name: `${method} ${routePath}`,
				path: routePath,
				method,
				filePath: uri.fsPath,
				type: 'nextjs-app',
			});
		}

		return routes;
	} catch (error) {
		logger.error(`Failed to parse route file: ${uri.fsPath}`, error);
		return [];
	}
}

/**
 * Extract API route path from file path (basic mode)
 */
function extractAppRoutePath(relativePath: string): string {
	// Normalize leading src/
	const normalized = relativePath.replace(/^src\//, '');

	// Remove 'app/' prefix and '/route.ts|js' suffix
	let routePath = normalized
		.replace(/^app\//, '/')
		.replace(/\/route\.(ts|js)$/, '');

	// Replace [param] with :param
	routePath = routePath.replace(/\[\[\.\.\.([^\]]+)\]\]/g, ':$1*?'); // Optional catch-all
	routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, ':$1*'); // Catch-all
	routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1'); // Regular param

	return routePath;
}

/**
 * Parse Next.js Pages Router routes (basic mode)
 */
export async function parsePageRoutes(): Promise<ParsedRoute[]> {
	try {
		logger.debug('Parsing Next.js Pages Router routes (basic mode)');
		const routes: ParsedRoute[] = [];

		// Find all API route files
		const files = await vscode.workspace.findFiles(
			FILE_PATTERNS.NEXTJS_PAGE_ROUTES,
			'**/node_modules/**',
		);

		for (const file of files) {
			const parsedRoute = await parsePageRouteFile(file);
			if (parsedRoute) {
				routes.push(parsedRoute);
			}
		}

		logger.info(`Parsed ${routes.length} Pages Router routes (basic mode)`);
		return routes;
	} catch (error) {
		logger.error('Failed to parse Pages Router routes (basic mode)', error);
		return [];
	}
}

/**
 * Parse a single Pages Router route file (basic mode)
 */
async function parsePageRouteFile(uri: vscode.Uri): Promise<ParsedRoute | null> {
	try {
		const content = await vscode.workspace.fs.readFile(uri);
		const text = content.toString();

		// Skip tRPC handlers
		if (isTRPCHandlerContent(text)) {
			logger.debug(`Skipping tRPC handler: ${uri.fsPath}`);
			return null;
		}

		// Extract route path from file path
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!workspaceFolder) {
			return null;
		}

		const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
		const routePath = extractPageRoutePath(relativePath);

		// Try to detect HTTP method from request handler
		let method: HttpMethod = 'GET'; // Default

		if (text.match(/req\.method\s*===\s*['"]POST['"]/)) {
			method = 'POST';
		} else if (text.match(/req\.method\s*===\s*['"]PUT['"]/)) {
			method = 'PUT';
		} else if (text.match(/req\.method\s*===\s*['"]PATCH['"]/)) {
			method = 'PATCH';
		} else if (text.match(/req\.method\s*===\s*['"]DELETE['"]/)) {
			method = 'DELETE';
		}

		return {
			name: `${method} ${routePath}`,
			path: routePath,
			method,
			filePath: uri.fsPath,
			type: 'nextjs-page',
		};
	} catch (error) {
		logger.error(`Failed to parse page route file: ${uri.fsPath}`, error);
		return null;
	}
}

/**
 * Extract API route path from file path (Pages Router - basic mode)
 */
function extractPageRoutePath(relativePath: string): string {
	// Remove 'pages/api/' prefix and file extension
	let routePath = relativePath
		.replace(/^(src\/)?pages\/api\//, '/api/')
		.replace(/\.(ts|js)$/, '');

	// Replace [param] with :param for consistency
	routePath = routePath.replace(/\[\[\.\.\.([^\]]+)\]\]/g, ':$1*?'); // Optional catch-all
	routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, ':$1*'); // Catch-all
	routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1'); // Regular param

	// Handle index routes
	routePath = routePath.replace(/\/index$/, '');

	return routePath || '/api';
}
