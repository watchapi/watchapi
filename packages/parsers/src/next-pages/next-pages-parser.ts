/**
 * Next.js Pages Router parser with AST-based detection
 * Parses routes from the /pages/api directory
 * Note: This module is decoupled from vscode - all functions accept rootDir as parameter
 */

import { Node, SourceFile, SyntaxKind } from "ts-morph";

import type { ParsedRoute, ParserOptions } from "../lib/types";
import type { HttpMethod } from "../lib/constants";
import { BaseParser } from "../shared/base-parser";

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
    type DynamicSegment,
} from "../shared/next-shared";
import { extractBodyFromSchema } from "../shared/zod-schema-parser";

/**
 * Next.js Pages Router route type
 */
type NextPagesRouteType = "pages-router";

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
    dynamicSegments: DynamicSegment[];
}

/**
 * Next.js Pages Router Parser class
 */
export class NextPagesParser extends BaseParser {
    private routePathCache = new Map<string, RouteDetectionResult>();

    constructor(rootDir: string, options?: ParserOptions) {
        super(
            rootDir,
            {
                name: "Next.js Pages Router",
                debugPrefix: "next-pages:parser",
                dependencies: ["next"],
                filePatterns: ["**/pages/api/**/*.{ts,js}"],
                requiresTsConfig: true,
            },
            options,
        );
    }

    /**
     * Parse Next.js Pages Router routes
     */
    protected async parseRoutes(): Promise<ParsedRoute[]> {
        const sourceFiles = this.getSourceFiles();
        this.debug(`Found ${sourceFiles.length} route file(s)`);

        const routeHandlers: NextPagesRouteHandler[] = [];

        for (const file of sourceFiles) {
            const filePath = file.getFilePath();
            this.debug(`Scanning file ${this.relativePath(filePath)}`);

            if (isTRPCHandler(file)) {
                this.debug(`Skipping tRPC handler: ${this.relativePath(filePath)}`);
                continue;
            }

            if (this.isPagesRouterFile(filePath)) {
                const handlers = this.parsePagesRouterFile(file);
                routeHandlers.push(...handlers);
            }
        }

        return this.convertToRoutes(routeHandlers);
    }

    /**
     * Detect if file is a Pages Router API file
     */
    private isPagesRouterFile(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/");
        return (
            normalized.includes("/pages/api/") &&
            !normalized.endsWith("/route.ts") &&
            !normalized.endsWith("/route.js")
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

        // Pages Router: pages/api/users/[id].ts -> /api/users/:id
        let routePath = relativePath
            .replace(/^(src\/)?pages/, "")
            .replace(/\.(ts|js)$/, "")
            .replace(/\/index$/, "");

        if (!routePath) {
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
     * Detect Pages Router handler pattern
     */
    private detectPagesRouterHandler(sourceFile: SourceFile): Node | null {
        // Look for default export
        const defaultExport = sourceFile.getDefaultExportSymbol();
        if (defaultExport) {
            const declarations = defaultExport.getDeclarations();
            if (declarations.length > 0) {
                this.debug("Found default export handler");
                return declarations[0];
            }
        }

        // Look for named export 'handler'
        const handlerExport = sourceFile.getExportedDeclarations().get("handler");
        if (handlerExport && handlerExport.length > 0) {
            this.debug("Found named handler export");
            return handlerExport[0];
        }

        return null;
    }

    /**
     * Collect request parameter names from handler
     */
    private collectReqParamNames(handler: Node): Set<string> {
        const names = new Set<string>(["req", "request"]);

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
    private isReqMethodExpression(node: Node, reqParamNames: Set<string>): boolean {
        if (!Node.isPropertyAccessExpression(node)) {
            return false;
        }

        if (node.getName() !== "method") {
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
    private detectPagesRouterMethods(handler: Node): HttpMethod[] {
        const methods = new Set<HttpMethod>();
        const sourceFile = handler.getSourceFile();
        const reqParamNames = this.collectReqParamNames(handler);

        const exportedMethods = this.detectExportedMethods(sourceFile);
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

                if (this.isReqMethodExpression(left, reqParamNames) && rightMethod) {
                    this.debug(`Detected ${rightMethod} method in handler`);
                    methods.add(rightMethod);
                    return;
                }

                if (this.isReqMethodExpression(right, reqParamNames) && leftMethod) {
                    this.debug(`Detected ${leftMethod} method in handler`);
                    methods.add(leftMethod);
                }
            }

            if (Node.isSwitchStatement(node)) {
                const expression = node.getExpression();
                if (!this.isReqMethodExpression(expression, reqParamNames)) {
                    return;
                }

                node.getCaseBlock()
                    .getClauses()
                    .forEach((clause) => {
                        if (!Node.isCaseClause(clause)) {
                            return;
                        }
                        const literal = extractMethodLiteral(clause.getExpression());
                        if (literal) {
                            this.debug(`Detected ${literal} method in switch case`);
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
    private parsePagesRouterFile(sourceFile: SourceFile): NextPagesRouteHandler[] {
        const handlers: NextPagesRouteHandler[] = [];
        const filePath = sourceFile.getFilePath();

        const { routePath, dynamicSegments } = this.extractRoutePath(filePath);
        const normalizedPath = normalizeRoutePath(routePath);

        const handler = this.detectPagesRouterHandler(sourceFile);
        if (!handler) {
            this.debug(`No handler found in Pages Router file: ${filePath}`);
            return handlers;
        }

        const methods = this.detectPagesRouterMethods(handler);
        const analysis = analyzeHandler(handler, this.debug, (h, d) =>
            extractBodyFromHandler(h, d, extractBodyFromSchema),
        );

        const middleware = hasMiddleware(sourceFile);

        methods.forEach((method) => {
            handlers.push({
                path: normalizedPath,
                method,
                file: this.relativePath(filePath),
                line: handler.getStartLineNumber(),
                type: "pages-router",
                isDynamic: dynamicSegments.length > 0,
                dynamicSegments: dynamicSegments.map((s) => s.name),
                hasMiddleware: middleware,
                ...analysis,
            });

            this.debug(
                `Found Pages Router ${method} handler at ${normalizedPath} (line ${handler.getStartLineNumber()})`,
            );
        });

        return handlers;
    }

    /**
     * Convert NextPagesRouteHandler to ParsedRoute
     */
    private convertToRoutes(handlers: NextPagesRouteHandler[]): ParsedRoute[] {
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
                type: "nextjs-page" as const,
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
 * Detect if directory has Next.js with Pages Router
 * @param rootDir - The root directory to check
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function hasNextPages(
    rootDir: string,
    options?: ParserOptions,
): Promise<boolean> {
    const parser = new NextPagesParser(rootDir, options);
    return parser.detect();
}

/**
 * Parse all Next.js Pages Router routes using AST analysis
 * @param rootDir - The root directory to parse routes from
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function parseNextPagesRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<ParsedRoute[]> {
    const parser = new NextPagesParser(rootDir, options);
    return parser.parse();
}
