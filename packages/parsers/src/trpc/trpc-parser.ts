/**
 * tRPC procedure parser with AST-based detection
 * Provides deterministic and accurate parsing of tRPC routers
 * Note: This module is decoupled from vscode - all functions accept rootDir as parameter
 */

import {
    ArrowFunction,
    CallExpression,
    FunctionExpression,
    Node,
    PropertyAssignment,
    ShorthandPropertyAssignment,
    SourceFile,
    SyntaxKind,
} from "ts-morph";

import type { ParsedRoute, ParserOptions } from "../lib/types";
import { BaseParser } from "../shared/base-parser";
import { extractBodyFromSchema } from "../shared/zod-schema-parser";

import { DEFAULT_TRPC_INCLUDE, SIDE_EFFECT_PATTERNS } from "./trpc-constants";
import {
    buildRouterDetectionConfig,
    collectRouterCallSites,
    isRouterReference,
    getRouterReferenceName,
    normalizeRouterName,
    type RouterDetectionConfig,
} from "./trpc-detection";
import type {
    TrpcProcedureNode,
    TrpcRouterMeta,
    RouterMountEdge,
    ProcedureVisibility,
    ProcedureMethod,
    RouterParseResult,
    ResolverAnalysis,
} from "./trpc-types";

/**
 * tRPC Parser class for extracting routes from tRPC routers
 */
export class TrpcParser extends BaseParser {
    private detection: RouterDetectionConfig | null = null;
    private routerMounts: RouterMountEdge[] = [];

    constructor(rootDir: string, options?: ParserOptions) {
        super(
            rootDir,
            {
                name: "tRPC",
                debugPrefix: "trpc:parser",
                dependencies: ["@trpc/server"],
                filePatterns: DEFAULT_TRPC_INCLUDE,
                requiresTsConfig: true,
            },
            options,
        );
    }

    /**
     * Parse tRPC routes from routers
     */
    protected async parseRoutes(): Promise<ParsedRoute[]> {
        this.detection = buildRouterDetectionConfig(undefined, undefined, this.debug);
        this.routerMounts = [];

        const sourceFiles = this.getSourceFiles();
        this.debug(`Found ${sourceFiles.length} source file(s)`);

        const nodes: TrpcProcedureNode[] = [];
        const routers: TrpcRouterMeta[] = [];

        // Extract procedures from each file
        for (const file of sourceFiles) {
            this.debug(`Scanning file ${this.relativePath(file.getFilePath())}`);
            const { nodes: fileNodes, routers: fileRouters } =
                this.extractProceduresFromFile(file);
            nodes.push(...fileNodes);
            routers.push(...fileRouters);
        }

        // Resolve router paths for composition
        const routerPathMap = this.resolveRouterPaths(routers);
        nodes.forEach((node) => {
            const mapped = routerPathMap.get(node.router);
            if (mapped !== undefined && mapped !== "") {
                node.router = mapped;
            }
        });
        routers.forEach((router) => {
            const mapped = routerPathMap.get(router.name);
            if (mapped !== undefined && mapped !== "") {
                router.name = mapped;
            }
        });

        return this.convertToRoutes(nodes);
    }

    /**
     * Extract procedures from a source file
     */
    private extractProceduresFromFile(
        sourceFile: SourceFile,
    ): { nodes: TrpcProcedureNode[]; routers: TrpcRouterMeta[] } {
        const nodes: TrpcProcedureNode[] = [];
        const routers: TrpcRouterMeta[] = [];

        const routerCalls = collectRouterCallSites(
            sourceFile,
            this.detection!,
            this.debug,
        );

        routerCalls.forEach(({ call, name }) => {
            const router = this.parseRouter(call, name);
            if (!router) {
                return;
            }

            this.debug(
                `Found router '${router.routerMeta.name}' in ${router.routerMeta.file} with ${router.nodes.length} procedure(s)`,
            );
            nodes.push(...router.nodes);
            routers.push(router.routerMeta);
        });

        if (!routerCalls.length) {
            this.debug(
                `No tRPC router found in ${this.relativePath(sourceFile.getFilePath())}`,
            );
        }

        return { nodes, routers };
    }

    /**
     * Parse a router definition
     */
    private parseRouter(
        initializer: CallExpression,
        routerName: string,
    ): RouterParseResult | null {
        const routesArg = initializer.getArguments()[0];
        if (!routesArg || !Node.isObjectLiteralExpression(routesArg)) {
            return null;
        }

        const routerDisplayName = this.deriveRouterPath(
            routerName,
            initializer.getSourceFile(),
        );

        const routerMeta: TrpcRouterMeta = {
            name: routerDisplayName,
            file: this.relativePath(initializer.getSourceFile().getFilePath()),
            line: initializer.getStartLineNumber(),
            linesOfCode:
                initializer.getEndLineNumber() - initializer.getStartLineNumber() + 1,
        };

        const nodes: TrpcProcedureNode[] = [];

        for (const property of routesArg.getProperties()) {
            if (
                !Node.isPropertyAssignment(property) &&
                !Node.isShorthandPropertyAssignment(property)
            ) {
                continue;
            }

            const nameNode = property.getNameNode();
            const procedureName = nameNode.getText().replace(/["']/g, "");
            const initializerNode = this.getInitializerFromProperty(property);
            if (!initializerNode) {
                continue;
            }

            // Check if this is a nested router
            if (isRouterReference(initializerNode, this.detection!)) {
                const refName =
                    getRouterReferenceName(initializerNode) ?? initializerNode.getText();
                this.routerMounts.push({
                    parent: routerDisplayName,
                    property: procedureName,
                    target: refName,
                });
                this.debug(
                    `Property '${procedureName}' in router '${routerName}' looks like a nested router; tracking composition`,
                );
                continue;
            }

            const procedureNode = this.parseProcedure(
                initializerNode,
                procedureName,
                routerDisplayName,
                nameNode.getStartLineNumber(),
            );

            if (procedureNode) {
                nodes.push(procedureNode);
                this.debug(
                    `Captured procedure '${procedureName}' (${procedureNode.method}) in router '${routerName}' at line ${procedureNode.line}`,
                );
            } else {
                this.debug(
                    `Skipping property '${procedureName}' in router '${routerName}' (not a tRPC procedure)`,
                );
            }
        }

        return { nodes, routerMeta };
    }

    /**
     * Get initializer from property assignment
     */
    private getInitializerFromProperty(
        property: PropertyAssignment | ShorthandPropertyAssignment,
    ): Node | undefined {
        if (Node.isPropertyAssignment(property)) {
            return property.getInitializer();
        }
        if (Node.isShorthandPropertyAssignment(property)) {
            return property.getObjectAssignmentInitializer();
        }
        return undefined;
    }

    /**
     * Parse a procedure definition
     */
    private parseProcedure(
        expression: Node,
        procedureName: string,
        routerName: string,
        line: number,
    ): TrpcProcedureNode | null {
        let method: ProcedureMethod | null = null;
        let input = false;
        let output = false;
        let procedureType: ProcedureVisibility = "unknown";
        let resolver: ArrowFunction | FunctionExpression | undefined;
        let inputSchema: Node | undefined;

        const walkExpression = (target: Node | undefined): void => {
            if (!target) {
                return;
            }

            if (Node.isCallExpression(target)) {
                const targetExpression = target.getExpression();

                if (Node.isPropertyAccessExpression(targetExpression)) {
                    const propertyName = targetExpression.getName();

                    if (propertyName === "input") {
                        input = true;
                        // Capture the input schema argument
                        const schemaArg = target.getArguments()[0];
                        if (schemaArg) {
                            inputSchema = schemaArg;
                        }
                    }
                    if (propertyName === "output") {
                        output = true;
                    }

                    if (propertyName === "mutation" || propertyName === "query") {
                        method = propertyName;
                        const handler = target.getArguments()[0];
                        if (
                            Node.isArrowFunction(handler) ||
                            Node.isFunctionExpression(handler)
                        ) {
                            resolver = handler;
                        }
                    }

                    const base = targetExpression.getExpression();
                    if (Node.isIdentifier(base)) {
                        procedureType = this.mapProcedureType(
                            base.getText(),
                            procedureType,
                        );
                    }

                    walkExpression(base);
                    return;
                }

                if (Node.isIdentifier(targetExpression)) {
                    procedureType = this.mapProcedureType(
                        targetExpression.getText(),
                        procedureType,
                    );
                }

                target.getChildren().forEach((child: Node) => walkExpression(child));
            }
        };

        walkExpression(expression);

        if (!method) {
            this.debug(
                `Expression for '${procedureName}' in router '${routerName}' is not a query/mutation; skipping`,
            );
            return null;
        }

        const resolverAnalysis = this.analyzeResolver(resolver);
        const bodyExample = inputSchema
            ? extractBodyFromSchema(inputSchema)
            : undefined;

        return {
            router: routerName,
            procedure: procedureName,
            method,
            input,
            output,
            file: this.relativePath(expression.getSourceFile().getFilePath()),
            line,
            procedureType,
            bodyExample,
            ...resolverAnalysis,
        };
    }

    /**
     * Map procedure type from identifier
     */
    private mapProcedureType(
        identifier: string,
        fallback: ProcedureVisibility,
    ): ProcedureVisibility {
        if (identifier === "publicProcedure") {
            return "public";
        }
        if (identifier === "privateProcedure") {
            return "private";
        }
        if (identifier === "protectedProcedure") {
            return "protected";
        }
        if (identifier === "adminProcedure") {
            return "admin";
        }
        return fallback;
    }

    /**
     * Analyze resolver implementation
     */
    private analyzeResolver(
        resolver?: ArrowFunction | FunctionExpression,
    ): ResolverAnalysis {
        if (!resolver) {
            return {
                resolverLines: 0,
                usesDb: false,
                hasErrorHandling: false,
                hasSideEffects: false,
                headers: { "Content-Type": "application/json" },
            };
        }

        const body = resolver.getBody();
        const resolverText = body.getText();
        const resolverLines =
            resolver.getEndLineNumber() - resolver.getStartLineNumber() + 1;

        const usesDb = /\b(db\.|prisma\.)/.test(resolverText);
        const hasErrorHandling =
            resolverText.includes("TRPCError") ||
            body.getDescendantsOfKind(SyntaxKind.TryStatement).length > 0 ||
            body
                .getDescendantsOfKind(SyntaxKind.ThrowStatement)
                .some((throwStmt) =>
                    throwStmt.getExpression()?.getText().includes("TRPCError"),
                );

        const hasSideEffects = SIDE_EFFECT_PATTERNS.test(resolverText);

        // tRPC always uses JSON
        const headers = { "Content-Type": "application/json" };

        return { resolverLines, usesDb, hasErrorHandling, hasSideEffects, headers };
    }

    /**
     * Derive router path from name or file
     */
    private deriveRouterPath(routerName: string, sourceFile: SourceFile): string {
        const fromName = normalizeRouterName(routerName);
        if (fromName) {
            return fromName;
        }

        const relativePath = this.relativePath(sourceFile.getFilePath()).replace(
            /\\/g,
            "/",
        );
        const fileBase = relativePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
        const fromFile = normalizeRouterName(fileBase);
        if (fromFile) {
            return fromFile;
        }

        const dirParts = relativePath.split("/");
        const dirBase = dirParts.length > 1 ? dirParts[dirParts.length - 2] : "";
        const fromDir = normalizeRouterName(dirBase);
        if (fromDir) {
            return fromDir;
        }

        return routerName;
    }

    /**
     * Resolve router paths for composition
     */
    private resolveRouterPaths(routers: TrpcRouterMeta[]): Map<string, string> {
        const byNormalized = new Map<string, string>();
        routers.forEach((router) => {
            const normalized = normalizeRouterName(router.name) || router.name;
            byNormalized.set(normalized, router.name);
        });

        const incoming = new Map<string, RouterMountEdge[]>();
        this.routerMounts.forEach((mount) => {
            const candidates = [
                normalizeRouterName(mount.target),
                normalizeRouterName(mount.property),
            ].filter(Boolean) as string[];

            const targetName =
                candidates.map((c) => byNormalized.get(c)).find(Boolean) ?? null;
            const key = targetName ?? candidates[0];
            if (!key) {
                return;
            }
            const list = incoming.get(key) ?? [];
            list.push(mount);
            incoming.set(key, list);
        });

        const roots = new Set<string>();
        routers.forEach((router) => {
            const norm = normalizeRouterName(router.name) || router.name;
            if (!incoming.has(router.name) && !incoming.has(norm)) {
                roots.add(router.name);
                roots.add(norm);
            }
        });

        const resolved = new Map<string, string>();
        const resolving = new Set<string>();

        const resolve = (name: string): string => {
            if (resolved.has(name)) {
                return resolved.get(name)!;
            }
            if (resolving.has(name)) {
                return name;
            }
            resolving.add(name);

            const normalized = normalizeRouterName(name) || name;
            const edges = incoming.get(name) ?? incoming.get(normalized) ?? [];
            const edge = edges[0];
            if (!edge) {
                const base = roots.has(name) || roots.has(normalized) ? "" : name;
                resolved.set(name, base);
                resolving.delete(name);
                return base;
            }

            const parentPath = resolve(edge.parent);
            const routePath = parentPath
                ? `${parentPath}.${edge.property}`
                : edge.property;

            resolved.set(name, routePath);
            resolving.delete(name);
            return routePath;
        };

        routers.forEach((router) => resolve(router.name));

        this.debug(
            `Router path map: ${Array.from(resolved.entries())
                .map(([from, to]) => `${from}→${to}`)
                .join(", ")}`,
        );

        return resolved;
    }

    /**
     * Convert JSON body example to query parameters
     * For tRPC queries (GET requests), input is sent as query params
     */
    private convertBodyToQueryParams(
        bodyExample: string,
    ): Record<string, string> | undefined {
        try {
            const parsed = JSON.parse(bodyExample);
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return undefined;
            }

            const queryParams: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (value === null || value === undefined) {
                    queryParams[key] = "";
                } else if (typeof value === "object") {
                    // Skip complex objects - query params should be primitives
                    continue;
                } else {
                    queryParams[key] = String(value);
                }
            }

            return Object.keys(queryParams).length > 0 ? queryParams : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Convert TrpcProcedureNode to ParsedRoute
     */
    private convertToRoutes(nodes: TrpcProcedureNode[]): ParsedRoute[] {
        return nodes.map((node) => {
            const routePath = node.router
                ? `/api/trpc/${node.router}.${node.procedure}`
                : `/api/trpc/${node.procedure}`;

            const method = node.method === "query" ? "GET" : "POST";

            // For GET requests (queries), convert body to query params
            // For POST requests (mutations), keep as body
            const queryParams =
                method === "GET" && node.bodyExample
                    ? this.convertBodyToQueryParams(node.bodyExample)
                    : node.queryParams;
            const body = method === "POST" ? node.bodyExample : undefined;

            return {
                name: `${method} ${routePath}`,
                path: routePath,
                method,
                filePath: this.joinPath(node.file),
                type: "trpc" as const,
                headers:
                    Object.keys(node.headers).length > 0 ? node.headers : undefined,
                query: queryParams,
                body,
            };
        });
    }
}

// =============================================================================
// Backward-compatible function exports
// =============================================================================

/**
 * Detect if directory has tRPC
 * @param rootDir - The root directory to check
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function hasTRPC(
    rootDir: string,
    options?: ParserOptions,
): Promise<boolean> {
    const parser = new TrpcParser(rootDir, options);
    return parser.detect();
}

/**
 * Parse tRPC router files using AST analysis
 * @param rootDir - The root directory to parse routes from
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function parseTRPCRouters(
    rootDir: string,
    options?: ParserOptions,
): Promise<ParsedRoute[]> {
    const parser = new TrpcParser(rootDir, options);
    return parser.parse();
}

/**
 * Get tRPC base path from configuration
 * Note: Currently returns the default tRPC base path
 */
export function getTRPCBasePath(): string {
    return "/api/trpc";
}
