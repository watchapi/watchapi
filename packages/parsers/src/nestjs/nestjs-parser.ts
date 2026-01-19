/**
 * NestJS route parser with AST-based detection
 * Parses controllers and DTOs to extract routes and request body schemas
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  Decorator,
  MethodDeclaration,
  Node,
  ParameterDeclaration,
  PropertyAccessExpression,
  Project,
  SourceFile,
  SyntaxKind,
  Type,
} from "ts-morph";

import { logger } from "../lib/logger";
import { FILE_PATTERNS } from "../lib/constants";
import type { ParsedRoute } from "../lib/types";
import type { HttpMethod } from "../lib/constants";
import {
  createDebugLogger,
  findTsConfig,
  hasWorkspaceDependency,
} from "../shared/parser-utils";

import {
  NESTJS_BODY_DECORATOR,
  NESTJS_CONTROLLER_DECORATOR,
  NESTJS_HEADER_DECORATOR,
  NESTJS_METHOD_DECORATORS,
  NESTJS_QUERY_DECORATOR,
} from "./nestjs-constants";
import type { DebugLogger, NestJsRouteHandler } from "./nestjs-types";

/**
 * Detect if current workspace has NestJS
 */
export async function hasNestJs(): Promise<boolean> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }
    const rootDir = workspaceFolders[0].uri.fsPath;
    const hasNest = hasWorkspaceDependency(rootDir, [
      "@nestjs/core",
      "@nestjs/common",
    ]);
    if (hasNest) {
      logger.info("Detected NestJS project");
    }
    return hasNest;
  } catch (error) {
    logger.error("Failed to detect NestJS", error);
    return false;
  }
}

/**
 * Parse NestJS controllers using AST analysis
 */
export async function parseNestJsRoutes(): Promise<ParsedRoute[]> {
  try {
    logger.debug("Parsing NestJS routes with AST");
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      logger.warn("No workspace folders found");
      return [];
    }

    const rootDir = workspaceFolders[0].uri.fsPath;
    const debug = createDebugLogger("nestjs:parser", true);

    const tsconfigPath = findTsConfig(rootDir);
    const project = tsconfigPath
      ? new Project({
          tsConfigFilePath: tsconfigPath,
          skipAddingFilesFromTsConfig: false,
        })
      : new Project({ skipAddingFilesFromTsConfig: true });

    if (tsconfigPath) {
      debug(`Using tsconfig at ${tsconfigPath}`);
    } else {
      debug("No tsconfig.json found, using default compiler options");
    }

    const controllerPattern = path.join(
      rootDir,
      FILE_PATTERNS.NESTJS_CONTROLLERS,
    );

    try {
      project.addSourceFilesAtPaths(controllerPattern);
      debug(`Added controller files: ${controllerPattern}`);
    } catch (error) {
      debug(`Failed to add controller files: ${error}`);
    }

    const globalPrefix = await findGlobalPrefix(rootDir, project, debug);

    const sourceFiles = project
      .getSourceFiles()
      .filter((file: SourceFile) => file.getFilePath().startsWith(rootDir));

    debug(`Found ${sourceFiles.length} controller file(s)`);

    const handlers: NestJsRouteHandler[] = [];

    for (const file of sourceFiles) {
      debug(`Scanning file ${path.relative(rootDir, file.getFilePath())}`);
      handlers.push(
        ...parseControllerFile(file, rootDir, debug, globalPrefix),
      );
    }

    const routes = convertToRoutes(handlers, rootDir);

    logger.info(`Parsed ${routes.length} NestJS routes using AST`);
    return routes;
  } catch (error) {
    logger.error("Failed to parse NestJS routes with AST", error);
    return [];
  }
}

function parseControllerFile(
  sourceFile: SourceFile,
  rootDir: string,
  debug: DebugLogger,
  globalPrefix?: string,
): NestJsRouteHandler[] {
  const handlers: NestJsRouteHandler[] = [];

  for (const classDecl of sourceFile.getClasses()) {
    const controllerDecorator = classDecl.getDecorator(
      NESTJS_CONTROLLER_DECORATOR,
    );
    if (!controllerDecorator) {
      continue;
    }

    const controllerConfig = extractControllerConfig(controllerDecorator);
    const normalizedControllerPaths =
      controllerConfig.paths.length > 0 ? controllerConfig.paths : [""];

    for (const method of classDecl.getMethods()) {
      const routeDecorators = getRouteDecorators(method);
      if (routeDecorators.length === 0) {
        continue;
      }

      const methodVersions = extractMethodVersions(method);
      const methodHeaders = extractHeadersFromMethod(method);
      const bodyExample = extractBodyExample(method, debug);
      const queryParams = extractQueryExample(method, debug);

      for (const routeDecorator of routeDecorators) {
        const decoratorPaths = extractDecoratorPaths(routeDecorator.decorator);
        const normalizedPaths =
          decoratorPaths.length > 0 ? decoratorPaths : [""];

        for (const controllerPath of normalizedControllerPaths) {
          for (const decoratorPath of normalizedPaths) {
            const routePaths = buildRoutePaths(
              controllerPath,
              decoratorPath,
              globalPrefix,
              methodVersions.length > 0
                ? methodVersions
                : controllerConfig.versions,
            );
            for (const methodName of routeDecorator.methods) {
              for (const routePath of routePaths) {
                const effectiveBody = bodyExample && shouldIncludeBody(methodName) ? bodyExample : undefined;

                // Auto-add Content-Type for JSON bodies
                const finalHeaders = { ...methodHeaders };
                if (effectiveBody && !finalHeaders['Content-Type']) {
                  finalHeaders['Content-Type'] = 'application/json';
                }

                handlers.push({
                  path: routePath,
                  method: methodName,
                  file: path.relative(rootDir, sourceFile.getFilePath()),
                  line: method.getStartLineNumber(),
                  headers: finalHeaders,
                  queryParams: queryParams,
                  bodyExample: effectiveBody,
                });

                debug(
                  `Found NestJS ${methodName} handler at ${routePath} (line ${method.getStartLineNumber()})`,
                );
              }
            }
          }
        }
      }
    }
  }

  return handlers;
}

function getRouteDecorators(
  method: MethodDeclaration,
): Array<{ decorator: Decorator; methods: HttpMethod[] }> {
  const decorators = method.getDecorators();
  const results: Array<{ decorator: Decorator; methods: HttpMethod[] }> = [];

  for (const decorator of decorators) {
    const name = decorator.getName();
    const mapped = NESTJS_METHOD_DECORATORS[name];
    if (!mapped) {
      continue;
    }

    const methods = Array.isArray(mapped) ? mapped : [mapped];
    results.push({ decorator, methods });
  }

  return results;
}

function extractControllerConfig(decorator: Decorator): {
  paths: string[];
  versions: string[];
} {
  const callExpression = decorator.getCallExpression();
  if (!callExpression) {
    return { paths: [""], versions: [] };
  }

  const args = callExpression.getArguments();
  if (args.length === 0) {
    return { paths: [""], versions: [] };
  }

  const firstArg = args[0];
  if (Node.isObjectLiteralExpression(firstArg)) {
    const pathProp = firstArg.getProperty("path");
    const versionProp = firstArg.getProperty("version");

    const paths =
      pathProp && Node.isPropertyAssignment(pathProp)
        ? extractPathsFromNode(pathProp.getInitializer() ?? firstArg)
        : [""];

    const versions =
      versionProp && Node.isPropertyAssignment(versionProp)
        ? extractVersionsFromNode(versionProp.getInitializer() ?? firstArg)
        : [];

    return { paths: paths.length > 0 ? paths : [""], versions };
  }

  return { paths: extractPathsFromNode(firstArg), versions: [] };
}

function extractDecoratorPaths(decorator: Decorator): string[] {
  const callExpression = decorator.getCallExpression();
  if (!callExpression) {
    return [""];
  }

  const args = callExpression.getArguments();
  if (args.length === 0) {
    return [""];
  }

  const firstArg = args[0];
  return extractPathsFromNode(firstArg);
}

function extractPathsFromNode(node: Node): string[] {
  const literal = resolveStringLiteral(node);
  if (literal !== undefined) {
    return [literal];
  }

  if (Node.isArrayLiteralExpression(node)) {
    const paths: string[] = [];
    node.getElements().forEach((element) => {
      paths.push(...extractPathsFromNode(element));
    });
    return paths;
  }

  if (Node.isObjectLiteralExpression(node)) {
    const prop = node.getProperty("path");
    if (prop && Node.isPropertyAssignment(prop)) {
      const initializer = prop.getInitializer();
      if (initializer) {
        return extractPathsFromNode(initializer);
      }
    }
  }

  return [""];
}

function extractVersionsFromNode(node: Node): string[] {
  const literal = resolveStringLiteral(node);
  if (literal !== undefined) {
    return [literal];
  }

  if (Node.isArrayLiteralExpression(node)) {
    const versions: string[] = [];
    node.getElements().forEach((element) => {
      versions.push(...extractVersionsFromNode(element));
    });
    return versions;
  }

  return [];
}

function buildRoutePaths(
  controllerPath: string,
  methodPath: string,
  globalPrefix?: string,
  versions?: string[],
): string[] {
  const normalize = (value: string): string =>
    value.replace(/^\/*/, "").replace(/\/*$/, "");

  const versionPrefixes = normalizeVersions(versions);

  const buildPath = (versionPrefix: string): string => {
    const parts = [globalPrefix ?? "", versionPrefix, controllerPath, methodPath]
      .map((segment) => normalize(segment))
      .filter((segment) => segment.length > 0);

    if (parts.length === 0) {
      return "/";
    }

    return `/${parts.join("/")}`;
  };

  if (versionPrefixes.length === 0) {
    return [buildPath("")];
  }

  return versionPrefixes.map((versionPrefix) => buildPath(versionPrefix));
}

function extractHeadersFromMethod(
  method: MethodDeclaration,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const decorator of method.getDecorators()) {
    if (decorator.getName() !== NESTJS_HEADER_DECORATOR) {
      continue;
    }

    const callExpression = decorator.getCallExpression();
    const args = callExpression?.getArguments() ?? [];
    if (args.length < 2) {
      continue;
    }

    const key = resolveStringLiteral(args[0]);
    const value = resolveStringLiteral(args[1]);

    if (key && value) {
      headers[key] = value;
    }
  }

  return headers;
}

function extractBodyExample(
  method: MethodDeclaration,
  debug: DebugLogger,
): string | undefined {
  const bodyParams = method.getParameters().flatMap((param) => {
    const decorator = param.getDecorator(NESTJS_BODY_DECORATOR);
    if (!decorator) {
      return [];
    }
    return [{ param, decorator }];
  }) as Array<{ param: ParameterDeclaration; decorator: Decorator }>;

  if (bodyParams.length === 0) {
    return undefined;
  }

  const bodyObject: Record<string, unknown> = {};
  let hasObjectBody = false;
  let primitiveBody: unknown;

  for (const entry of bodyParams) {
    const paramType = entry.param.getType();
    const example = typeToExample(paramType, entry.param, 0, new Set());
    const decoratorArg = entry.decorator.getCallExpression()?.getArguments()[0];
    const bodyKey = decoratorArg ? resolveStringLiteral(decoratorArg) : undefined;

    if (bodyKey) {
      bodyObject[bodyKey] = example;
      hasObjectBody = true;
      continue;
    }

    if (example && typeof example === "object" && !Array.isArray(example)) {
      if (Object.keys(example).length > 0) {
        Object.assign(bodyObject, example);
        hasObjectBody = true;
        continue;
      }
    }

    primitiveBody = example;
  }

  const bodyExample = hasObjectBody
    ? JSON.stringify(bodyObject, null, 2)
    : primitiveBody !== undefined
      ? JSON.stringify(primitiveBody, null, 2)
      : undefined;

  if (!bodyExample) {
    debug("Failed to build NestJS body example");
    return undefined;
  }

  return bodyExample;
}

function extractQueryExample(
  method: MethodDeclaration,
  debug: DebugLogger,
): Record<string, string> | undefined {
  const queryParams = method.getParameters().flatMap((param) => {
    const decorator = param.getDecorator(NESTJS_QUERY_DECORATOR);
    if (!decorator) {
      return [];
    }
    return [{ param, decorator }];
  }) as Array<{ param: ParameterDeclaration; decorator: Decorator }>;

  if (queryParams.length === 0) {
    return undefined;
  }

  const queryObject: Record<string, string> = {};

  for (const entry of queryParams) {
    const paramType = entry.param.getType();
    const example = typeToExample(paramType, entry.param, 0, new Set());
    const decoratorArg = entry.decorator.getCallExpression()?.getArguments()[0];
    const queryKey = decoratorArg ? resolveStringLiteral(decoratorArg) : undefined;

    if (queryKey) {
      // Single query parameter with a specific key
      const serialized = serializeQueryValue(example);
      if (serialized !== "") {
        queryObject[queryKey] = serialized;
      }
      continue;
    }

    // No key means entire query object (DTO)
    if (example && typeof example === "object" && !Array.isArray(example)) {
      // Flatten object properties as query params
      for (const [key, value] of Object.entries(example)) {
        const serialized = serializeQueryValue(value);
        if (serialized !== "") {
          queryObject[key] = serialized;
        }
      }
    }
  }

  if (Object.keys(queryObject).length === 0) {
    debug("No query parameters found");
    return undefined;
  }

  return queryObject;
}

function serializeQueryValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    // Empty arrays become empty string
    if (value.length === 0) {
      return "";
    }
    return value.map(serializeQueryValue).join(",");
  }

  if (typeof value === "object") {
    // Empty objects should return empty string (query params should be primitives)
    if (Object.keys(value).length === 0) {
      return "";
    }
    // For non-empty objects, don't serialize them - query params should be primitives
    // Just return empty string to avoid %7B%7D encoding
    return "";
  }

  return String(value);
}

function typeToExample(
  type: Type,
  location: Node,
  depth: number,
  visited: Set<string>,
): unknown {
  if (depth > 3) {
    return {};
  }

  const literalValue = type.getLiteralValue();
  if (literalValue !== undefined) {
    return literalValue;
  }

  if (type.isString()) {
    return "";
  }
  if (type.isNumber()) {
    return 0;
  }
  if (type.isBoolean()) {
    return false;
  }
  if (type.isAny() || type.isUnknown()) {
    return {};
  }

  if (type.isArray()) {
    const element = type.getArrayElementType();
    if (!element) {
      return [];
    }
    return [typeToExample(element, location, depth + 1, visited)];
  }

  if (type.isUnion()) {
    const candidates = type
      .getUnionTypes()
      .filter((member) => !member.isUndefined() && !member.isNull());
    if (candidates.length > 0) {
      return typeToExample(candidates[0], location, depth + 1, visited);
    }
  }

  if (type.isEnum() || type.isEnumLiteral()) {
    const text = type.getText(location);
    return text.split(".").pop() ?? text;
  }

  if (type.isObject()) {
    const key = type.getText(location);
    if (visited.has(key)) {
      return {};
    }
    visited.add(key);

    const properties = type.getProperties();
    const objectValue: Record<string, unknown> = {};

    for (const prop of properties) {
      const name = prop.getName();
      if (name.startsWith("__")) {
        continue;
      }

      const declaration = prop.getValueDeclaration() ?? prop.getDeclarations()[0];
      if (
        declaration &&
        (Node.isMethodDeclaration(declaration) ||
          Node.isMethodSignature(declaration))
      ) {
        continue;
      }
      const propType = prop.getTypeAtLocation(declaration ?? location);
      objectValue[name] = typeToExample(
        propType,
        declaration ?? location,
        depth + 1,
        visited,
      );
    }

    visited.delete(key);
    return objectValue;
  }

  return {};
}

function extractStringLiteral(node: Node): string | undefined {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  return undefined;
}

function shouldIncludeBody(method: HttpMethod): boolean {
  return ["POST", "PUT", "PATCH"].includes(method);
}

function convertToRoutes(
  handlers: NestJsRouteHandler[],
  rootDir: string,
): ParsedRoute[] {
  return handlers.map((handler) => ({
    name: `${handler.method} ${handler.path}`,
    path: handler.path,
    method: handler.method,
    filePath: path.join(rootDir, handler.file),
    type: "nestjs",
    headers:
      Object.keys(handler.headers).length > 0 ? handler.headers : undefined,
    query: handler.queryParams,
    body: handler.bodyExample,
  }));
}

function extractMethodVersions(method: MethodDeclaration): string[] {
  const decorator = method.getDecorator("Version");
  if (!decorator) {
    return [];
  }

  const callExpression = decorator.getCallExpression();
  const args = callExpression?.getArguments() ?? [];
  if (args.length === 0) {
    return [];
  }

  return extractVersionsFromNode(args[0]);
}

function normalizeVersions(versions?: string[]): string[] {
  if (!versions || versions.length === 0) {
    return [];
  }

  return versions
    .map((version) => {
      if (!version) {
        return "";
      }
      return version.startsWith("v") ? version : `v${version}`;
    })
    .filter(Boolean);
}

async function findGlobalPrefix(
  rootDir: string,
  project: Project,
  debug: DebugLogger,
): Promise<string | undefined> {
  const candidates = ["src/main.ts", "main.ts"].map((file) =>
    path.join(rootDir, file),
  );

  for (const filePath of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    } catch {
      continue;
    }

    try {
      const sourceFile =
        project.getSourceFile(filePath) ??
        project.addSourceFileAtPath(filePath);
      const prefix = extractGlobalPrefix(sourceFile);
      if (prefix) {
        debug(`Detected NestJS global prefix: ${prefix}`);
        return prefix;
      }
    } catch (error) {
      debug(`Failed to read global prefix from ${filePath}: ${error}`);
    }
  }

  return undefined;
}

function extractGlobalPrefix(sourceFile: SourceFile): string | undefined {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expression = call.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      continue;
    }

    if (expression.getName() !== "setGlobalPrefix") {
      continue;
    }

    const args = call.getArguments();
    if (args.length === 0) {
      continue;
    }

    const prefix = resolveStringLiteral(args[0]);
    if (prefix) {
      return prefix;
    }
  }

  return undefined;
}

function resolveStringLiteral(node: Node): string | undefined {
  const literal = extractStringLiteral(node);
  if (literal !== undefined) {
    return literal;
  }

  if (Node.isIdentifier(node)) {
    const symbol = node.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    for (const declaration of declarations) {
      if (Node.isVariableDeclaration(declaration)) {
        const initializer = declaration.getInitializer();
        if (initializer) {
          const resolved = extractStringLiteral(initializer);
          if (resolved !== undefined) {
            return resolved;
          }
        }
      }

      if (Node.isEnumMember(declaration)) {
        const initializer = declaration.getInitializer();
        if (initializer) {
          const resolved = extractStringLiteral(initializer);
          if (resolved !== undefined) {
            return resolved;
          }
        }
      }
    }
  }

  if (Node.isPropertyAccessExpression(node)) {
    return resolvePropertyAccessString(node);
  }

  const type = node.getType();
  const literalValue = type.getLiteralValue();
  if (typeof literalValue === "string") {
    return literalValue;
  }

  return undefined;
}

function resolvePropertyAccessString(
  node: PropertyAccessExpression,
): string | undefined {
  const symbol = node.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isEnumMember(declaration)) {
      const initializer = declaration.getInitializer();
      if (initializer) {
        const resolved = extractStringLiteral(initializer);
        if (resolved !== undefined) {
          return resolved;
        }
      }
    }
  }

  return undefined;
}
