/**
 * tRPC procedure parser with AST-based detection
 * Environment agnostic - works in CLI, VSCode, or any Node.js context
 */

import * as path from "path";
import * as fs from "fs";
import {
  ArrowFunction,
  CallExpression,
  FunctionExpression,
  Node,
  Project,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  SourceFile,
} from "ts-morph";

import type { ParsedRoute } from "../lib/types";
import { extractBodyFromSchema } from "../shared/zod-schema-parser";

import { DEFAULT_TRPC_INCLUDE } from "./trpc-constants";
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
  DebugLogger,
  RouterParseResult,
  ResolverAnalysis,
} from "./trpc-types";

/**
 * Options for tRPC parsing
 */
export interface TrpcParseOptions {
  rootDir: string;
  tsconfigPath?: string;
  include?: string[];
  verbose?: boolean;
  routerFactories?: string[];
  routerIdentifierPattern?: string;
}

/**
 * Result of tRPC parsing
 */
export interface TrpcParseResult {
  routes: ParsedRoute[];
  procedures: TrpcProcedureNode[];
  routers: TrpcRouterMeta[];
}

/**
 * Check if a project has tRPC installed
 */
export function hasTRPC(rootDir: string): boolean {
  try {
    const packageJsonPath = path.join(rootDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    return !!(
      packageJson.dependencies?.["@trpc/server"] ||
      packageJson.devDependencies?.["@trpc/server"]
    );
  } catch {
    return false;
  }
}

/**
 * Parse tRPC routers using AST analysis
 */
export function parseTRPCRouters(options: TrpcParseOptions): TrpcParseResult {
  const { rootDir, verbose } = options;
  const debug = createDebugLogger(verbose);

  debug("Parsing tRPC routers with AST");

  // Find tsconfig
  const tsconfigPath = options.tsconfigPath
    ? path.resolve(rootDir, options.tsconfigPath)
    : findTsConfig(rootDir);

  if (!tsconfigPath) {
    debug("No tsconfig.json found, cannot parse routes without AST");
    return { routes: [], procedures: [], routers: [] };
  }

  // Initialize ts-morph project
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });

  debug(`Using tsconfig at ${tsconfigPath}`);

  // Add source files matching tRPC patterns
  const includeGlobs = options.include?.length
    ? options.include
    : DEFAULT_TRPC_INCLUDE;

  debug(`Include patterns: ${includeGlobs.join(", ")}`);

  for (const pattern of includeGlobs) {
    const fullPattern = path.join(rootDir, pattern);
    try {
      project.addSourceFilesAtPaths(fullPattern);
    } catch (error) {
      debug(`Failed to add files for pattern ${pattern}: ${error}`);
    }
  }

  const sourceFiles = project
    .getSourceFiles()
    .filter((file: SourceFile) => file.getFilePath().startsWith(rootDir));

  debug(`Found ${sourceFiles.length} source file(s) under root ${rootDir}`);

  const nodes: TrpcProcedureNode[] = [];
  const routers: TrpcRouterMeta[] = [];
  const detection = buildRouterDetectionConfig(
    options.routerFactories,
    options.routerIdentifierPattern,
    debug,
  );
  const routerMounts: RouterMountEdge[] = [];

  // Extract procedures from each file
  for (const file of sourceFiles) {
    debug(`Scanning file ${path.relative(rootDir, file.getFilePath())}`);
    const { nodes: fileNodes, routers: fileRouters } =
      extractProceduresFromFile(file, rootDir, detection, routerMounts, debug);
    nodes.push(...fileNodes);
    routers.push(...fileRouters);
  }

  // Resolve router paths for composition
  const routerPathMap = resolveRouterPaths(routers, routerMounts, debug);
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

  // Convert to ParsedRoute format
  const routes = convertToRoutes(nodes, rootDir);

  debug(`Parsed ${routes.length} tRPC procedures using AST`);
  return { routes, procedures: nodes, routers };
}

/**
 * Find tsconfig.json in directory
 */
function findTsConfig(rootDir: string): string | null {
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    return tsconfigPath;
  }
  return null;
}

/**
 * Extract procedures from a source file
 */
function extractProceduresFromFile(
  sourceFile: SourceFile,
  rootDir: string,
  detection: RouterDetectionConfig,
  routerMounts: RouterMountEdge[],
  debug: DebugLogger,
): { nodes: TrpcProcedureNode[]; routers: TrpcRouterMeta[] } {
  const nodes: TrpcProcedureNode[] = [];
  const routers: TrpcRouterMeta[] = [];

  const routerCalls = collectRouterCallSites(sourceFile, detection, debug);

  routerCalls.forEach(({ call, name }) => {
    const router = parseRouter(
      call,
      name,
      rootDir,
      detection,
      routerMounts,
      debug,
    );
    if (!router) {
      return;
    }

    debug(
      `Found router '${router.routerMeta.name}' in ${router.routerMeta.file} with ${router.nodes.length} procedure(s)`,
    );
    nodes.push(...router.nodes);
    routers.push(router.routerMeta);
  });

  if (!routerCalls.length) {
    debug(
      `No tRPC router found in ${path.relative(
        rootDir,
        sourceFile.getFilePath(),
      )}`,
    );
  }

  return { nodes, routers };
}

/**
 * Parse a router definition
 */
function parseRouter(
  initializer: CallExpression,
  routerName: string,
  rootDir: string,
  detection: RouterDetectionConfig,
  routerMounts: RouterMountEdge[],
  debug: DebugLogger,
): RouterParseResult | null {
  const routesArg = initializer.getArguments()[0];
  if (!routesArg || !Node.isObjectLiteralExpression(routesArg)) {
    return null;
  }

  const routerDisplayName = deriveRouterPath(
    routerName,
    initializer.getSourceFile(),
    rootDir,
  );

  const routerMeta: TrpcRouterMeta = {
    name: routerDisplayName,
    file: path.relative(rootDir, initializer.getSourceFile().getFilePath()),
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
    const initializerNode = getInitializerFromProperty(property);
    if (!initializerNode) {
      continue;
    }

    // Check if this is a nested router
    if (isRouterReference(initializerNode, detection)) {
      const refName =
        getRouterReferenceName(initializerNode) ?? initializerNode.getText();
      routerMounts.push({
        parent: routerDisplayName,
        property: procedureName,
        target: refName,
      });
      debug(
        `Property '${procedureName}' in router '${routerName}' looks like a nested router; tracking composition`,
      );
      continue;
    }

    const procedureNode = parseProcedure(
      initializerNode,
      procedureName,
      routerDisplayName,
      rootDir,
      nameNode.getStartLineNumber(),
      debug,
    );

    if (procedureNode) {
      nodes.push(procedureNode);
      debug(
        `Captured procedure '${procedureName}' (${procedureNode.method}) in router '${routerName}' at line ${procedureNode.line}`,
      );
    } else {
      debug(
        `Skipping property '${procedureName}' in router '${routerName}' (not a tRPC procedure)`,
      );
    }
  }

  return { nodes, routerMeta };
}

/**
 * Get initializer from property assignment
 */
function getInitializerFromProperty(
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
function parseProcedure(
  expression: Node,
  procedureName: string,
  routerName: string,
  rootDir: string,
  line: number,
  debug: DebugLogger,
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
          procedureType = mapProcedureType(base.getText(), procedureType);
        }

        walkExpression(base);
        return;
      }

      if (Node.isIdentifier(targetExpression)) {
        procedureType = mapProcedureType(
          targetExpression.getText(),
          procedureType,
        );
      }

      target.getChildren().forEach((child: Node) => walkExpression(child));
    }
  };

  walkExpression(expression);

  if (!method) {
    debug(
      `Expression for '${procedureName}' in router '${routerName}' is not a query/mutation; skipping`,
    );
    return null;
  }

  const resolverAnalysis = analyzeResolver(resolver);
  const bodyExample = inputSchema
    ? extractBodyFromSchema(inputSchema)
    : undefined;

  return {
    router: routerName,
    procedure: procedureName,
    method,
    input,
    output,
    file: path.relative(rootDir, expression.getSourceFile().getFilePath()),
    line,
    procedureType,
    bodyExample,
    ...resolverAnalysis,
  };
}

/**
 * Map procedure type from identifier
 */
function mapProcedureType(
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
 * Note: heuristic fields (usesDb, hasErrorHandling, hasSideEffects) are set to false
 * as they are not reliably deterministic across different projects
 */
function analyzeResolver(
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

  const resolverLines =
    resolver.getEndLineNumber() - resolver.getStartLineNumber() + 1;

  // tRPC always uses JSON - this is deterministic
  const headers = { "Content-Type": "application/json" };

  return {
    resolverLines,
    usesDb: false,
    hasErrorHandling: false,
    hasSideEffects: false,
    headers,
  };
}

/**
 * Derive router path from name or file
 */
function deriveRouterPath(
  routerName: string,
  sourceFile: SourceFile,
  rootDir: string,
): string {
  const fromName = normalizeRouterName(routerName);
  if (fromName) {
    return fromName;
  }

  const relativePath = path
    .relative(rootDir, sourceFile.getFilePath())
    .replace(/\\/g, "/");
  const fileBase = path.basename(relativePath).replace(/\.[^.]+$/, "");
  const fromFile = normalizeRouterName(fileBase);
  if (fromFile) {
    return fromFile;
  }

  const dirBase = path.basename(path.dirname(relativePath));
  const fromDir = normalizeRouterName(dirBase);
  if (fromDir) {
    return fromDir;
  }

  return routerName;
}

/**
 * Resolve router paths for composition
 */
function resolveRouterPaths(
  routers: TrpcRouterMeta[],
  mounts: RouterMountEdge[],
  debug: DebugLogger,
): Map<string, string> {
  const byNormalized = new Map<string, string>();
  routers.forEach((router) => {
    const normalized = normalizeRouterName(router.name) || router.name;
    byNormalized.set(normalized, router.name);
  });

  const incoming = new Map<string, RouterMountEdge[]>();
  mounts.forEach((mount) => {
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

  debug(
    `Router path map: ${Array.from(resolved.entries())
      .map(([from, to]) => `${from}→${to}`)
      .join(", ")}`,
  );

  return resolved;
}

/**
 * Convert JSON body example to query parameters
 */
function convertBodyToQueryParams(
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
function convertToRoutes(
  nodes: TrpcProcedureNode[],
  rootDir: string,
): ParsedRoute[] {
  return nodes.map((node) => {
    const routePath = node.router
      ? `/api/trpc/${node.router}.${node.procedure}`
      : `/api/trpc/${node.procedure}`;

    const method = node.method === "query" ? "GET" : "POST";

    const queryParams =
      method === "GET" && node.bodyExample
        ? convertBodyToQueryParams(node.bodyExample)
        : node.queryParams;
    const body = method === "POST" ? node.bodyExample : undefined;

    return {
      name: `${method} ${routePath}`,
      path: routePath,
      method,
      filePath: path.join(rootDir, node.file),
      type: "trpc" as const,
      headers: Object.keys(node.headers).length > 0 ? node.headers : undefined,
      query: queryParams,
      body,
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
    console.log(`[trpc:parser] ${message}`);
  };
}

/**
 * Get tRPC base path (default /api/trpc)
 */
export function getTRPCBasePath(): string {
  return "/api/trpc";
}
