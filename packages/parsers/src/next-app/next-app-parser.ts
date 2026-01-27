/**
 * Next.js App Router parser with AST-based detection
 * Parses routes from the /app directory (route.ts files)
 * Note: This module is decoupled from vscode - all functions accept rootDir as parameter
 */

import { Node, SourceFile } from "ts-morph";

import type { ParsedRoute, ParserOptions } from "../lib/types";
import type { HttpMethod } from "../lib/constants";
import { BaseParser } from "../shared/base-parser";

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
    type DynamicSegment,
} from "../shared/next-shared";
import { extractBodyFromSchema } from "../shared/zod-schema-parser";

/**
 * Next.js App Router route type
 */
type NextAppRouteType = "app-router";

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
    dynamicSegments: DynamicSegment[];
}

/**
 * Next.js App Router Parser class
 */
export class NextAppParser extends BaseParser {
    private routePathCache = new Map<string, RouteDetectionResult>();

    constructor(rootDir: string, options?: ParserOptions) {
        super(
            rootDir,
            {
                name: "Next.js App Router",
                debugPrefix: "next-app:parser",
                dependencies: ["next"],
                filePatterns: ["**/app/**/route.{ts,js}"],
                requiresTsConfig: true,
            },
            options,
        );
    }

    /**
     * Parse Next.js App Router routes
     */
    protected async parseRoutes(): Promise<ParsedRoute[]> {
        const sourceFiles = this.getSourceFiles();
        this.debug(`Found ${sourceFiles.length} route file(s)`);

        const routeHandlers: NextAppRouteHandler[] = [];

        for (const file of sourceFiles) {
            const filePath = file.getFilePath();
            this.debug(`Scanning file ${this.relativePath(filePath)}`);

            if (isTRPCHandler(file)) {
                this.debug(`Skipping tRPC handler: ${this.relativePath(filePath)}`);
                continue;
            }

            // Skip Payload CMS internal routes
            if (this.isPayloadCMSRoute(filePath)) {
                this.debug(`Skipping Payload CMS route: ${this.relativePath(filePath)}`);
                continue;
            }

            if (this.isAppRouterFile(filePath)) {
                const handlers = this.parseAppRouterFile(file);
                routeHandlers.push(...handlers);
            }
        }

        return this.convertToRoutes(routeHandlers);
    }

    /**
     * Detect if file is an App Router route file
     */
    private isAppRouterFile(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/");
        return (
            normalized.includes("/app/") &&
            (normalized.endsWith("/route.ts") || normalized.endsWith("/route.js"))
        );
    }

    /**
     * Detect if file is a Payload CMS internal route
     * Payload CMS 3.x uses Next.js catch-all routes in (payload) route group
     */
    private isPayloadCMSRoute(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/");
        return (
            normalized.includes("/(payload)/") ||
            normalized.includes("/app/(payload)") ||
            (normalized.includes("/admin/") && normalized.includes("[[...segments]]"))
        );
    }

    /**
     * Extract route path from file path
     */
    private extractRoutePath(filePath: string): RouteDetectionResult {
        const cacheKey = `${this.rootDir}::${filePath}`;
        const cached = this.routePathCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const relativePath = this.relativePath(filePath).replace(/\\/g, "/");
        this.debug(`Extracting route path from: ${relativePath}`);

        // App Router: app/api/users/[id]/route.ts -> /api/users/:id
        let routePath = relativePath
            .replace(/^(src\/)?app/, "")
            .replace(/\/route\.(ts|js)$/, "")
            .replace(/^\//, "");

        // Ensure routes start with /
        if (routePath !== "") {
            routePath = "/" + routePath;
        } else {
            routePath = "/";
        }

        // Extract dynamic segments
        const dynamicSegments = extractDynamicSegments(routePath);

        // Convert [param] to :param
        routePath = convertDynamicSegments(routePath);

        this.debug(`Extracted route path: ${routePath}`);

        const result = {
            routePath,
            dynamicSegments,
        };
        this.routePathCache.set(cacheKey, result);
        return result;
    }

    /**
     * Collect exported HTTP method handlers from source file
     */
    private collectHttpMethodHandlers(sourceFile: SourceFile): Map<HttpMethod, Node> {
        const handlers = new Map<HttpMethod, Node>();

        // Find all exported function declarations
        sourceFile.getFunctions().forEach((func) => {
            if (!func.isExported()) {
                return;
            }

            const name = func.getName();
            if (name && NEXTJS_HTTP_METHODS.includes(name as HttpMethod)) {
                this.debug(`Found exported ${name} handler`);
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
                if (
                    initializer &&
                    (Node.isArrowFunction(initializer) ||
                        Node.isFunctionExpression(initializer))
                ) {
                    this.debug(`Found exported ${name} handler (arrow/function expression)`);
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
                    this.debug(`Found named export ${name} handler`);
                    handlers.set(name as HttpMethod, decl);
                }
            });
        });

        return handlers;
    }

    /**
     * Detect exported methods array pattern
     */
    private detectExportedMethods(sourceFile: SourceFile): HttpMethod[] {
        const methods = new Set<HttpMethod>();

        sourceFile.getVariableDeclarations().forEach((decl) => {
            if (decl.getName() !== "methods") {
                return;
            }

            const statement = decl.getVariableStatement();
            if (!statement?.isExported()) {
                return;
            }

            const initializer = decl.getInitializer();
            const found = this.extractMethodsFromExpression(initializer, sourceFile);
            found.forEach((method) => methods.add(method));
        });

        if (methods.size > 0) {
            this.debug(`Detected exported methods array: ${Array.from(methods).join(", ")}`);
        }

        return Array.from(methods);
    }

    /**
     * Extract methods from expression
     */
    private extractMethodsFromExpression(
        node: Node | undefined,
        sourceFile: SourceFile,
    ): HttpMethod[] {
        if (!node) {
            return [];
        }

        if (
            Node.isAsExpression(node) ||
            Node.isTypeAssertion(node) ||
            Node.isParenthesizedExpression(node)
        ) {
            return this.extractMethodsFromExpression(node.getExpression(), sourceFile);
        }

        if (Node.isIdentifier(node)) {
            const declaration = sourceFile.getVariableDeclaration(node.getText());
            if (declaration) {
                return this.extractMethodsFromExpression(
                    declaration.getInitializer(),
                    sourceFile,
                );
            }
        }

        if (!Node.isArrayLiteralExpression(node)) {
            return [];
        }

        const methods: HttpMethod[] = [];
        node.getElements().forEach((element) => {
            if (
                Node.isStringLiteral(element) ||
                Node.isNoSubstitutionTemplateLiteral(element)
            ) {
                const value = element.getLiteralValue().toUpperCase();
                if (
                    NEXTJS_HTTP_METHODS.includes(value as HttpMethod) &&
                    !methods.includes(value as HttpMethod)
                ) {
                    methods.push(value as HttpMethod);
                }
            }
        });

        return methods;
    }

    /**
     * Parse App Router route file
     */
    private parseAppRouterFile(sourceFile: SourceFile): NextAppRouteHandler[] {
        const handlers: NextAppRouteHandler[] = [];
        const filePath = sourceFile.getFilePath();

        const { routePath, dynamicSegments } = this.extractRoutePath(filePath);
        const normalizedPath = normalizeRoutePath(routePath);

        const methodHandlers = this.collectHttpMethodHandlers(sourceFile);
        const exportedMethods = this.detectExportedMethods(sourceFile);
        const methodSet = new Set<HttpMethod>([
            ...methodHandlers.keys(),
            ...exportedMethods,
        ]);

        const middleware = hasMiddleware(sourceFile);
        const serverAction = isServerAction(sourceFile);

        methodSet.forEach((method) => {
            const handler = methodHandlers.get(method) ?? sourceFile;
            const analysis = analyzeHandler(handler, this.debug, (h, d) =>
                extractBodyFromHandler(h, d, extractBodyFromSchema),
            );

            handlers.push({
                path: normalizedPath,
                method,
                file: this.relativePath(filePath),
                line: handler.getStartLineNumber(),
                type: "app-router",
                isDynamic: dynamicSegments.length > 0,
                dynamicSegments: dynamicSegments.map((s) => s.name),
                hasMiddleware: middleware,
                isServerAction: serverAction,
                ...analysis,
            });

            this.debug(
                `Found App Router ${method} handler at ${normalizedPath} (line ${handler.getStartLineNumber()})`,
            );
        });

        return handlers;
    }

    /**
     * Convert NextAppRouteHandler to ParsedRoute
     */
    private convertToRoutes(handlers: NextAppRouteHandler[]): ParsedRoute[] {
        return handlers.map((handler) => {
            const name = `${handler.method} ${handler.path}`;

            const effectiveBody =
                handler.bodyExample && shouldIncludeBody(handler.method)
                    ? handler.bodyExample
                    : undefined;

            return {
                name,
                path: handler.path,
                method: handler.method,
                filePath: this.joinPath(handler.file),
                type: "nextjs-app" as const,
                headers:
                    Object.keys(handler.headers).length > 0 ? handler.headers : undefined,
                query: handler.queryParams,
                body: effectiveBody,
            };
        });
    }
}

// =============================================================================
// Backward-compatible function exports
// =============================================================================

/**
 * Detect if directory has Next.js with App Router
 * @param rootDir - The root directory to check
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function hasNextApp(
    rootDir: string,
    options?: ParserOptions,
): Promise<boolean> {
    const parser = new NextAppParser(rootDir, options);
    return parser.detect();
}

/**
 * Parse all Next.js App Router routes using AST analysis
 * @param rootDir - The root directory to parse routes from
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function parseNextAppRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<ParsedRoute[]> {
    const parser = new NextAppParser(rootDir, options);
    return parser.parse();
}
