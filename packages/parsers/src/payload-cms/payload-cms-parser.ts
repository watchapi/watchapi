/**
 * Payload CMS route parser with AST-based detection
 * Parses Payload CMS config to extract collections, globals, and custom endpoints
 * Note: This module is decoupled from vscode - all functions accept rootDir as parameter
 */

import * as fs from "fs";
import * as path from "path";
import {
    Node,
    Project,
    SourceFile,
    SyntaxKind,
    ObjectLiteralExpression,
} from "ts-morph";

import { logger } from "../lib/logger";
import type { ParsedRoute, ParserOptions } from "../lib/types";
import {
    createDebugLogger,
    findTsConfig,
    hasWorkspaceDependency,
} from "../shared/parser-utils";
import { logger as defaultLogger } from "../lib/logger";
import {
    PAYLOAD_DEPENDENCIES,
    PAYLOAD_CONFIG_PATTERNS,
    COLLECTION_OPERATIONS,
    AUTH_COLLECTION_OPERATIONS,
    UPLOAD_COLLECTION_OPERATIONS,
    GLOBAL_OPERATIONS,
    DEFAULT_PAYLOAD_ENDPOINTS,
    METHOD_MAP,
} from "./payload-cms-constants";
import type { DebugLogger, PayloadRouteHandler } from "./payload-cms-types";

/**
 * Detect if directory has Payload CMS
 * @param rootDir - The root directory to check
 */
export async function hasPayloadCMS(
    rootDir: string,
    options?: ParserOptions,
): Promise<boolean> {
    const logger = options?.logger ?? defaultLogger;
    try {
        const hasPayload = await hasWorkspaceDependency(rootDir, [
            ...PAYLOAD_DEPENDENCIES,
        ]);
        if (hasPayload) {
            logger.info("Detected Payload CMS project");
        }
        return hasPayload;
    } catch (error) {
        logger.error("Failed to detect Payload CMS", error);
        return false;
    }
}

/**
 * Parse Payload CMS config using AST analysis
 * @param rootDir - The root directory to parse routes from
 */
export async function parsePayloadCMSRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<ParsedRoute[]> {
    const logger = options?.logger ?? defaultLogger;
    try {
        logger.debug("Parsing Payload CMS routes with AST");
        if (!rootDir) {
            logger.warn("No root directory provided");
            return [];
        }

        const debug = createDebugLogger("payload:parser", true);

        const tsconfigPath = await findTsConfig(rootDir);
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

        // Add all TypeScript files to enable import resolution
        // This is needed to resolve imported collections from separate files
        try {
            const srcPattern = path.join(rootDir, "src/**/*.{ts,tsx}");
            const rootPattern = path.join(rootDir, "*.{ts,tsx}");
            project.addSourceFilesAtPaths([srcPattern, rootPattern]);
            debug(`Added source files for import resolution`);
        } catch (error) {
            debug(`Failed to add source files: ${error}`);
        }

        // Find Payload config file
        const configFile = await findPayloadConfig(rootDir, project, debug);
        if (!configFile) {
            logger.warn("Payload CMS: No config file found");
            return [];
        }

        logger.info(`Payload CMS: Found config at ${configFile.getFilePath()}`);

        // Extract routes from config
        const handlers = parsePayloadConfig(configFile, rootDir, debug);
        logger.info(`Payload CMS: Extracted ${handlers.length} route handlers`);

        const routes = convertToRoutes(handlers, rootDir);

        logger.info(`Parsed ${routes.length} Payload CMS routes using AST`);
        return routes;
    } catch (error) {
        logger.error("Failed to parse Payload CMS routes with AST", error);
        return [];
    }
}

/**
 * Find the Payload CMS config file
 */
async function findPayloadConfig(
    rootDir: string,
    project: Project,
    debug: DebugLogger,
): Promise<SourceFile | null> {
    for (const pattern of PAYLOAD_CONFIG_PATTERNS) {
        const configPath = path.join(rootDir, pattern);
        try {
            await fs.promises.access(configPath);
            debug(`Found config file: ${configPath}`);
            const sourceFile =
                project.getSourceFile(configPath) ??
                project.addSourceFileAtPath(configPath);
            return sourceFile;
        } catch {
            // File doesn't exist, try next pattern
        }
    }
    return null;
}

/**
 * Parse the Payload config file to extract routes
 */
function parsePayloadConfig(
    sourceFile: SourceFile,
    rootDir: string,
    debug: DebugLogger,
): PayloadRouteHandler[] {
    const handlers: PayloadRouteHandler[] = [];
    const filePath = path.relative(rootDir, sourceFile.getFilePath());

    // Find the buildConfig call or default export
    const configObject = findPayloadConfigObject(sourceFile, debug);
    if (!configObject) {
        debug("Could not find Payload config object");
        return handlers;
    }

    // Extract API prefix (default is "/api")
    const apiPrefix = extractApiPrefix(configObject, debug);
    debug(`API prefix: ${apiPrefix}`);

    // Extract collections
    const collections = extractCollections(configObject, debug);
    logger.info(`Payload CMS: Found ${collections.length} collections`);
    for (const collection of collections) {
        const collectionRoutes = generateCollectionRoutes(
            collection,
            apiPrefix,
            filePath,
            rootDir,
            debug,
        );
        logger.info(
            `Payload CMS: Collection '${collection.slug}' generated ${collectionRoutes.length} routes`,
        );
        handlers.push(...collectionRoutes);
    }

    // Extract globals
    const globals = extractGlobals(configObject, debug);
    for (const global of globals) {
        handlers.push(
            ...generateGlobalRoutes(
                global,
                apiPrefix,
                filePath,
                rootDir,
                debug,
            ),
        );
    }

    // Extract custom endpoints
    const endpoints = extractEndpoints(configObject, debug);
    for (const endpoint of endpoints) {
        const handler = generateEndpointRoute(
            endpoint,
            apiPrefix,
            filePath,
            debug,
        );
        if (handler) {
            handlers.push(handler);
        }
    }

    // Add default Payload endpoints (preferences, access, etc.)
    const defaultRoutes = generateDefaultEndpoints(apiPrefix, filePath, debug);
    handlers.push(...defaultRoutes);

    return handlers;
}

/**
 * Find the Payload config object from the source file
 */
function findPayloadConfigObject(
    sourceFile: SourceFile,
    debug: DebugLogger,
): ObjectLiteralExpression | null {
    // Look for buildConfig call: buildConfig({ ... })
    const callExpressions = sourceFile.getDescendantsOfKind(
        SyntaxKind.CallExpression,
    );

    for (const call of callExpressions) {
        const expression = call.getExpression();
        const name = Node.isIdentifier(expression)
            ? expression.getText()
            : null;

        if (name === "buildConfig") {
            const args = call.getArguments();
            if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
                debug("Found buildConfig call with config object");
                return args[0];
            }
        }
    }

    // Look for default export with object literal
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
        const declarations = defaultExport.getDeclarations();
        for (const declaration of declarations) {
            if (Node.isExportAssignment(declaration)) {
                const expression = declaration.getExpression();
                if (Node.isObjectLiteralExpression(expression)) {
                    debug("Found default export with config object");
                    return expression;
                }
                // Check if it's a call expression like export default buildConfig({})
                if (Node.isCallExpression(expression)) {
                    const args = expression.getArguments();
                    if (
                        args.length > 0 &&
                        Node.isObjectLiteralExpression(args[0])
                    ) {
                        debug("Found default export with buildConfig call");
                        return args[0];
                    }
                }
            }
        }
    }

    return null;
}

/**
 * Extract the API prefix from config
 */
function extractApiPrefix(
    config: ObjectLiteralExpression,
    debug: DebugLogger,
): string {
    const routesProp = config.getProperty("routes");
    if (routesProp && Node.isPropertyAssignment(routesProp)) {
        const initializer = routesProp.getInitializer();
        if (initializer && Node.isObjectLiteralExpression(initializer)) {
            const apiProp = initializer.getProperty("api");
            if (apiProp && Node.isPropertyAssignment(apiProp)) {
                const apiValue = apiProp.getInitializer();
                if (apiValue && Node.isStringLiteral(apiValue)) {
                    const prefix = apiValue.getLiteralValue();
                    debug(`Found custom API prefix: ${prefix}`);
                    return prefix;
                }
            }
        }
    }
    return "/api";
}

/**
 * Parsed collection data
 */
interface ParsedCollection {
    slug: string;
    auth: boolean;
    upload: boolean;
    endpoints: Array<{ path: string; method: string }>;
    line: number;
    sourceFile?: string;
}

/**
 * Extract collections from config
 * Handles both inline collection definitions and imported collections
 */
function extractCollections(
    config: ObjectLiteralExpression,
    debug: DebugLogger,
): ParsedCollection[] {
    const collections: ParsedCollection[] = [];

    const collectionsProp = config.getProperty("collections");
    if (!collectionsProp || !Node.isPropertyAssignment(collectionsProp)) {
        return collections;
    }

    const initializer = collectionsProp.getInitializer();
    if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
        return collections;
    }

    for (const element of initializer.getElements()) {
        // Handle inline object literal
        if (Node.isObjectLiteralExpression(element)) {
            const collection = parseCollectionObject(element, debug);
            if (collection) {
                collections.push(collection);
            }
            continue;
        }

        // Handle imported/referenced collection (identifier or property access)
        if (
            Node.isIdentifier(element) ||
            Node.isPropertyAccessExpression(element)
        ) {
            const resolved = resolveCollectionReference(element, debug);
            if (resolved) {
                collections.push(resolved);
            }
            continue;
        }

        // Handle spread elements: ...otherCollections
        if (Node.isSpreadElement(element)) {
            const spreadExpr = element.getExpression();
            const spreadCollections = resolveSpreadCollections(
                spreadExpr,
                debug,
            );
            collections.push(...spreadCollections);
            continue;
        }

        debug(`Unhandled collection element type: ${element.getKindName()}`);
    }

    return collections;
}

/**
 * Parse a collection from an object literal expression
 */
function parseCollectionObject(
    obj: ObjectLiteralExpression,
    debug: DebugLogger,
    sourceFile?: string,
): ParsedCollection | null {
    const slug = extractStringProperty(obj, "slug");
    if (!slug) {
        debug("Collection missing slug property");
        return null;
    }

    const auth = extractBooleanProperty(obj, "auth");
    const upload = extractBooleanProperty(obj, "upload");
    const endpoints = extractCollectionEndpoints(obj, debug);

    debug(`Found collection: ${slug} (auth: ${auth}, upload: ${upload})`);

    return {
        slug,
        auth,
        upload,
        endpoints,
        line: obj.getStartLineNumber(),
        sourceFile,
    };
}

/**
 * Resolve an imported collection reference to its definition
 */
function resolveCollectionReference(
    node: Node,
    debug: DebugLogger,
): ParsedCollection | null {
    const nodeName = Node.isIdentifier(node)
        ? node.getText()
        : Node.isPropertyAccessExpression(node)
          ? node.getName()
          : "unknown";

    debug(`Resolving collection reference: ${nodeName}`);

    // Get the symbol and follow to definition
    const symbol = node.getSymbol();
    if (!symbol) {
        debug(`Could not resolve symbol for: ${nodeName}`);
        return null;
    }

    const declarations = symbol.getDeclarations();
    for (const declaration of declarations) {
        // Handle variable declaration: const Users = { slug: 'users', ... }
        if (Node.isVariableDeclaration(declaration)) {
            const initializer = declaration.getInitializer();
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const sourceFile = declaration.getSourceFile().getFilePath();
                debug(`Resolved ${nodeName} to object in ${sourceFile}`);
                return parseCollectionObject(initializer, debug, sourceFile);
            }

            // Handle: const Users = buildCollection({ slug: 'users', ... })
            if (initializer && Node.isCallExpression(initializer)) {
                const args = initializer.getArguments();
                if (
                    args.length > 0 &&
                    Node.isObjectLiteralExpression(args[0])
                ) {
                    const sourceFile = declaration
                        .getSourceFile()
                        .getFilePath();
                    debug(
                        `Resolved ${nodeName} to function call result in ${sourceFile}`,
                    );
                    return parseCollectionObject(args[0], debug, sourceFile);
                }
            }

            // Handle: const Users: CollectionConfig = { ... } with as expression
            if (initializer && Node.isAsExpression(initializer)) {
                const expr = initializer.getExpression();
                if (Node.isObjectLiteralExpression(expr)) {
                    const sourceFile = declaration
                        .getSourceFile()
                        .getFilePath();
                    debug(
                        `Resolved ${nodeName} via as expression in ${sourceFile}`,
                    );
                    return parseCollectionObject(expr, debug, sourceFile);
                }
            }

            // Handle: const Users = { ... } satisfies CollectionConfig
            if (initializer && Node.isSatisfiesExpression(initializer)) {
                const expr = initializer.getExpression();
                if (Node.isObjectLiteralExpression(expr)) {
                    const sourceFile = declaration
                        .getSourceFile()
                        .getFilePath();
                    debug(
                        `Resolved ${nodeName} via satisfies expression in ${sourceFile}`,
                    );
                    return parseCollectionObject(expr, debug, sourceFile);
                }
            }

            // Fallback: try to extract object from any initializer structure
            if (initializer) {
                const objLiteral = findObjectLiteralInExpression(initializer);
                if (objLiteral) {
                    const sourceFile = declaration
                        .getSourceFile()
                        .getFilePath();
                    debug(
                        `Resolved ${nodeName} via fallback extraction in ${sourceFile}`,
                    );
                    return parseCollectionObject(objLiteral, debug, sourceFile);
                }
            }
        }

        // Handle export assignment: export default { slug: 'users', ... }
        if (Node.isExportAssignment(declaration)) {
            const expression = declaration.getExpression();
            if (Node.isObjectLiteralExpression(expression)) {
                const sourceFile = declaration.getSourceFile().getFilePath();
                debug(
                    `Resolved ${nodeName} from export default in ${sourceFile}`,
                );
                return parseCollectionObject(expression, debug, sourceFile);
            }
        }

        // Handle import specifier - follow to source
        if (Node.isImportSpecifier(declaration)) {
            const importDecl = declaration.getImportDeclaration();
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            debug(`Following import from: ${moduleSpecifier}`);

            // Use ts-morph's built-in module resolution
            const resolvedModule = importDecl.getModuleSpecifierSourceFile();

            if (resolvedModule) {
                debug(
                    `Resolved module to: ${resolvedModule.getFilePath()}`,
                );
                // Look for the exported symbol in the resolved module
                const exportedSymbol = resolvedModule
                    .getExportedDeclarations()
                    .get(declaration.getName());
                if (exportedSymbol && exportedSymbol.length > 0) {
                    const exportedDecl = exportedSymbol[0];
                    if (Node.isVariableDeclaration(exportedDecl)) {
                        const initializer = exportedDecl.getInitializer();
                        // Try to find object literal in any expression type
                        const objLiteral = initializer
                            ? findObjectLiteralInExpression(initializer)
                            : null;
                        if (objLiteral) {
                            debug(
                                `Resolved imported ${nodeName} from ${resolvedModule.getFilePath()}`,
                            );
                            return parseCollectionObject(
                                objLiteral,
                                debug,
                                resolvedModule.getFilePath(),
                            );
                        }
                    }
                }
            } else {
                debug(`Could not resolve module: ${moduleSpecifier}`);
            }
        }
    }

    debug(`Could not resolve collection: ${nodeName}`);
    return null;
}

/**
 * Find an ObjectLiteralExpression within various expression types
 * Handles: direct object, call expressions, as expressions, satisfies expressions
 */
function findObjectLiteralInExpression(
    expr: Node,
): ObjectLiteralExpression | null {
    if (Node.isObjectLiteralExpression(expr)) {
        return expr;
    }

    if (Node.isCallExpression(expr)) {
        const args = expr.getArguments();
        if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
            return args[0];
        }
    }

    if (Node.isAsExpression(expr)) {
        return findObjectLiteralInExpression(expr.getExpression());
    }

    if (Node.isSatisfiesExpression(expr)) {
        return findObjectLiteralInExpression(expr.getExpression());
    }

    if (Node.isParenthesizedExpression(expr)) {
        return findObjectLiteralInExpression(expr.getExpression());
    }

    return null;
}

/**
 * Resolve spread collections: [...otherCollections]
 */
function resolveSpreadCollections(
    expr: Node,
    debug: DebugLogger,
): ParsedCollection[] {
    const collections: ParsedCollection[] = [];

    if (Node.isIdentifier(expr)) {
        debug(`Resolving spread identifier: ${expr.getText()}`);
        const symbol = expr.getSymbol();
        if (!symbol) {
            return collections;
        }

        for (const declaration of symbol.getDeclarations()) {
            if (Node.isVariableDeclaration(declaration)) {
                const initializer = declaration.getInitializer();
                if (initializer && Node.isArrayLiteralExpression(initializer)) {
                    for (const element of initializer.getElements()) {
                        if (Node.isObjectLiteralExpression(element)) {
                            const collection = parseCollectionObject(
                                element,
                                debug,
                            );
                            if (collection) {
                                collections.push(collection);
                            }
                        } else if (Node.isIdentifier(element)) {
                            const resolved = resolveCollectionReference(
                                element,
                                debug,
                            );
                            if (resolved) {
                                collections.push(resolved);
                            }
                        }
                    }
                }
            }
        }
    }

    return collections;
}

/**
 * Extract custom endpoints from a collection
 * Handles both inline endpoint definitions and imported endpoint references
 */
function extractCollectionEndpoints(
    collection: ObjectLiteralExpression,
    debug: DebugLogger,
): Array<{ path: string; method: string }> {
    const endpoints: Array<{ path: string; method: string }> = [];

    const endpointsProp = collection.getProperty("endpoints");
    if (!endpointsProp || !Node.isPropertyAssignment(endpointsProp)) {
        return endpoints;
    }

    const initializer = endpointsProp.getInitializer();
    if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
        return endpoints;
    }

    for (const element of initializer.getElements()) {
        // Handle inline object literal
        if (Node.isObjectLiteralExpression(element)) {
            const endpoint = parseEndpointObject(element, debug);
            if (endpoint) {
                endpoints.push(endpoint);
            }
            continue;
        }

        // Handle imported endpoint reference (identifier)
        if (Node.isIdentifier(element)) {
            const resolved = resolveEndpointReference(element, debug);
            if (resolved) {
                endpoints.push(resolved);
            }
            continue;
        }

        // Handle spread elements: ...otherEndpoints
        if (Node.isSpreadElement(element)) {
            const spreadExpr = element.getExpression();
            const spreadEndpoints = resolveSpreadEndpoints(spreadExpr, debug);
            endpoints.push(...spreadEndpoints);
            continue;
        }

        debug(`Unhandled endpoint element type: ${element.getKindName()}`);
    }

    return endpoints;
}

/**
 * Parse an endpoint from an object literal expression
 */
function parseEndpointObject(
    obj: ObjectLiteralExpression,
    debug: DebugLogger,
): { path: string; method: string } | null {
    const path = extractStringProperty(obj, "path");
    const method = extractStringProperty(obj, "method");

    if (path && method) {
        debug(`Found endpoint: ${method.toUpperCase()} ${path}`);
        return { path, method };
    }

    return null;
}

/**
 * Resolve an imported endpoint reference to its definition
 */
function resolveEndpointReference(
    node: Node,
    debug: DebugLogger,
): { path: string; method: string } | null {
    const nodeName = Node.isIdentifier(node) ? node.getText() : "unknown";
    debug(`Resolving endpoint reference: ${nodeName}`);

    const symbol = node.getSymbol();
    if (!symbol) {
        debug(`Could not resolve symbol for endpoint: ${nodeName}`);
        return null;
    }

    const declarations = symbol.getDeclarations();
    for (const declaration of declarations) {
        // Handle variable declaration: const checkoutEndpoint = { path: '/checkout', ... }
        if (Node.isVariableDeclaration(declaration)) {
            const initializer = declaration.getInitializer();
            const objLiteral = initializer
                ? findObjectLiteralInExpression(initializer)
                : null;
            if (objLiteral) {
                debug(`Resolved endpoint ${nodeName} to object`);
                return parseEndpointObject(objLiteral, debug);
            }
        }

        // Handle import specifier - follow to source
        if (Node.isImportSpecifier(declaration)) {
            const importDecl = declaration.getImportDeclaration();
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            debug(`Following endpoint import from: ${moduleSpecifier}`);

            const resolvedModule = importDecl.getModuleSpecifierSourceFile();
            if (resolvedModule) {
                const exportedSymbol = resolvedModule
                    .getExportedDeclarations()
                    .get(declaration.getName());
                if (exportedSymbol && exportedSymbol.length > 0) {
                    const exportedDecl = exportedSymbol[0];
                    if (Node.isVariableDeclaration(exportedDecl)) {
                        const init = exportedDecl.getInitializer();
                        const objLiteral = init
                            ? findObjectLiteralInExpression(init)
                            : null;
                        if (objLiteral) {
                            debug(
                                `Resolved imported endpoint ${nodeName} from ${resolvedModule.getFilePath()}`,
                            );
                            return parseEndpointObject(objLiteral, debug);
                        }
                    }
                }
            }
        }
    }

    debug(`Could not resolve endpoint: ${nodeName}`);
    return null;
}

/**
 * Resolve spread endpoints: [...otherEndpoints]
 */
function resolveSpreadEndpoints(
    expr: Node,
    debug: DebugLogger,
): Array<{ path: string; method: string }> {
    const endpoints: Array<{ path: string; method: string }> = [];

    if (Node.isIdentifier(expr)) {
        debug(`Resolving spread endpoint identifier: ${expr.getText()}`);
        const symbol = expr.getSymbol();
        if (!symbol) {
            return endpoints;
        }

        for (const declaration of symbol.getDeclarations()) {
            if (Node.isVariableDeclaration(declaration)) {
                const initializer = declaration.getInitializer();
                if (initializer && Node.isArrayLiteralExpression(initializer)) {
                    for (const element of initializer.getElements()) {
                        if (Node.isObjectLiteralExpression(element)) {
                            const endpoint = parseEndpointObject(element, debug);
                            if (endpoint) {
                                endpoints.push(endpoint);
                            }
                        } else if (Node.isIdentifier(element)) {
                            const resolved = resolveEndpointReference(
                                element,
                                debug,
                            );
                            if (resolved) {
                                endpoints.push(resolved);
                            }
                        }
                    }
                }
            }
        }
    }

    return endpoints;
}

/**
 * Parsed global data
 */
interface ParsedGlobal {
    slug: string;
    endpoints: Array<{ path: string; method: string }>;
    line: number;
    sourceFile?: string;
}

/**
 * Extract globals from config
 * Handles both inline global definitions and imported globals
 */
function extractGlobals(
    config: ObjectLiteralExpression,
    debug: DebugLogger,
): ParsedGlobal[] {
    const globals: ParsedGlobal[] = [];

    const globalsProp = config.getProperty("globals");
    if (!globalsProp || !Node.isPropertyAssignment(globalsProp)) {
        return globals;
    }

    const initializer = globalsProp.getInitializer();
    if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
        return globals;
    }

    for (const element of initializer.getElements()) {
        // Handle inline object literal
        if (Node.isObjectLiteralExpression(element)) {
            const global = parseGlobalObject(element, debug);
            if (global) {
                globals.push(global);
            }
            continue;
        }

        // Handle imported/referenced global
        if (
            Node.isIdentifier(element) ||
            Node.isPropertyAccessExpression(element)
        ) {
            const resolved = resolveGlobalReference(element, debug);
            if (resolved) {
                globals.push(resolved);
            }
            continue;
        }

        // Handle spread elements
        if (Node.isSpreadElement(element)) {
            const spreadExpr = element.getExpression();
            const spreadGlobals = resolveSpreadGlobals(spreadExpr, debug);
            globals.push(...spreadGlobals);
            continue;
        }

        debug(`Unhandled global element type: ${element.getKindName()}`);
    }

    return globals;
}

/**
 * Parse a global from an object literal expression
 */
function parseGlobalObject(
    obj: ObjectLiteralExpression,
    debug: DebugLogger,
    sourceFile?: string,
): ParsedGlobal | null {
    const slug = extractStringProperty(obj, "slug");
    if (!slug) {
        debug("Global missing slug property");
        return null;
    }

    const endpoints = extractCollectionEndpoints(obj, debug);
    debug(`Found global: ${slug}`);

    return {
        slug,
        endpoints,
        line: obj.getStartLineNumber(),
        sourceFile,
    };
}

/**
 * Resolve an imported global reference to its definition
 */
function resolveGlobalReference(
    node: Node,
    debug: DebugLogger,
): ParsedGlobal | null {
    const nodeName = Node.isIdentifier(node)
        ? node.getText()
        : Node.isPropertyAccessExpression(node)
          ? node.getName()
          : "unknown";

    debug(`Resolving global reference: ${nodeName}`);

    const symbol = node.getSymbol();
    if (!symbol) {
        debug(`Could not resolve symbol for global: ${nodeName}`);
        return null;
    }

    const declarations = symbol.getDeclarations();
    for (const declaration of declarations) {
        if (Node.isVariableDeclaration(declaration)) {
            const initializer = declaration.getInitializer();
            if (initializer && Node.isObjectLiteralExpression(initializer)) {
                const sourceFile = declaration.getSourceFile().getFilePath();
                debug(`Resolved global ${nodeName} to object in ${sourceFile}`);
                return parseGlobalObject(initializer, debug, sourceFile);
            }

            if (initializer && Node.isCallExpression(initializer)) {
                const args = initializer.getArguments();
                if (
                    args.length > 0 &&
                    Node.isObjectLiteralExpression(args[0])
                ) {
                    const sourceFile = declaration
                        .getSourceFile()
                        .getFilePath();
                    debug(
                        `Resolved global ${nodeName} to function call result in ${sourceFile}`,
                    );
                    return parseGlobalObject(args[0], debug, sourceFile);
                }
            }
        }

        if (Node.isImportSpecifier(declaration)) {
            const importDecl = declaration.getImportDeclaration();
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            debug(`Following global import from: ${moduleSpecifier}`);

            // Use ts-morph's built-in module resolution
            const resolvedModule = importDecl.getModuleSpecifierSourceFile();

            if (resolvedModule) {
                debug(
                    `Resolved global module to: ${resolvedModule.getFilePath()}`,
                );
                const exportedSymbol = resolvedModule
                    .getExportedDeclarations()
                    .get(declaration.getName());
                if (exportedSymbol && exportedSymbol.length > 0) {
                    const exportedDecl = exportedSymbol[0];
                    if (Node.isVariableDeclaration(exportedDecl)) {
                        const init = exportedDecl.getInitializer();
                        // Try to find object literal in any expression type
                        const objLiteral = init
                            ? findObjectLiteralInExpression(init)
                            : null;
                        if (objLiteral) {
                            debug(
                                `Resolved imported global ${nodeName} from ${resolvedModule.getFilePath()}`,
                            );
                            return parseGlobalObject(
                                objLiteral,
                                debug,
                                resolvedModule.getFilePath(),
                            );
                        }
                    }
                }
            } else {
                debug(`Could not resolve global module: ${moduleSpecifier}`);
            }
        }
    }

    debug(`Could not resolve global: ${nodeName}`);
    return null;
}

/**
 * Resolve spread globals: [...otherGlobals]
 */
function resolveSpreadGlobals(expr: Node, debug: DebugLogger): ParsedGlobal[] {
    const globals: ParsedGlobal[] = [];

    if (Node.isIdentifier(expr)) {
        debug(`Resolving spread global identifier: ${expr.getText()}`);
        const symbol = expr.getSymbol();
        if (!symbol) {
            return globals;
        }

        for (const declaration of symbol.getDeclarations()) {
            if (Node.isVariableDeclaration(declaration)) {
                const initializer = declaration.getInitializer();
                if (initializer && Node.isArrayLiteralExpression(initializer)) {
                    for (const element of initializer.getElements()) {
                        if (Node.isObjectLiteralExpression(element)) {
                            const global = parseGlobalObject(element, debug);
                            if (global) {
                                globals.push(global);
                            }
                        } else if (Node.isIdentifier(element)) {
                            const resolved = resolveGlobalReference(
                                element,
                                debug,
                            );
                            if (resolved) {
                                globals.push(resolved);
                            }
                        }
                    }
                }
            }
        }
    }

    return globals;
}

/**
 * Extract top-level custom endpoints from config
 */
function extractEndpoints(
    config: ObjectLiteralExpression,
    debug: DebugLogger,
): Array<{ path: string; method: string; root: boolean; line: number }> {
    const endpoints: Array<{
        path: string;
        method: string;
        root: boolean;
        line: number;
    }> = [];

    const endpointsProp = config.getProperty("endpoints");
    if (!endpointsProp || !Node.isPropertyAssignment(endpointsProp)) {
        return endpoints;
    }

    const initializer = endpointsProp.getInitializer();
    if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
        return endpoints;
    }

    for (const element of initializer.getElements()) {
        if (!Node.isObjectLiteralExpression(element)) {
            continue;
        }

        const path = extractStringProperty(element, "path");
        const method = extractStringProperty(element, "method");
        const root = extractBooleanProperty(element, "root");

        if (path && method) {
            endpoints.push({
                path,
                method,
                root,
                line: element.getStartLineNumber(),
            });
            debug(`Found custom endpoint: ${method.toUpperCase()} ${path}`);
        }
    }

    return endpoints;
}

/**
 * Generate routes for a collection
 */
function generateCollectionRoutes(
    collection: ParsedCollection,
    apiPrefix: string,
    configFilePath: string,
    rootDir: string,
    debug: DebugLogger,
): PayloadRouteHandler[] {
    const handlers: PayloadRouteHandler[] = [];
    const basePath = `${apiPrefix}/${collection.slug}`;

    // Use the collection's source file if available, otherwise use config file
    const filePath = collection.sourceFile
        ? path.relative(rootDir, collection.sourceFile)
        : configFilePath;

    // Standard CRUD operations
    for (const op of COLLECTION_OPERATIONS) {
        const routePath = `${basePath}${op.pathSuffix}`;

        // For upload collections, POST (create) uses multipart/form-data
        let contentType: string | undefined;
        if (op.hasBody) {
            if (collection.upload && op.name === "create") {
                contentType = "multipart/form-data";
            } else {
                contentType = "application/json";
            }
        }

        handlers.push({
            path: routePath,
            method: op.method,
            file: filePath,
            line: collection.line,
            source: "collection",
            collectionSlug: collection.slug,
            headers: contentType ? { "Content-Type": contentType } : undefined,
        });
        debug(`Generated collection route: ${op.method} ${routePath}`);
    }

    // Auth operations if applicable
    if (collection.auth) {
        for (const op of AUTH_COLLECTION_OPERATIONS) {
            const routePath = `${basePath}${op.pathSuffix}`;
            handlers.push({
                path: routePath,
                method: op.method,
                file: filePath,
                line: collection.line,
                source: "collection",
                collectionSlug: collection.slug,
                headers: op.hasBody
                    ? { "Content-Type": "application/json" }
                    : undefined,
            });
            debug(`Generated auth route: ${op.method} ${routePath}`);
        }
    }

    // Upload operations if applicable
    if (collection.upload) {
        for (const op of UPLOAD_COLLECTION_OPERATIONS) {
            const routePath = `${basePath}${op.pathSuffix}`;
            handlers.push({
                path: routePath,
                method: op.method,
                file: filePath,
                line: collection.line,
                source: "collection",
                collectionSlug: collection.slug,
                headers: { "Content-Type": "multipart/form-data" },
            });
            debug(`Generated upload route: ${op.method} ${routePath}`);
        }
    }

    // Custom collection endpoints
    for (const endpoint of collection.endpoints) {
        const method = METHOD_MAP[endpoint.method.toLowerCase()];
        if (method) {
            const routePath = `${basePath}${endpoint.path}`;
            handlers.push({
                path: routePath,
                method,
                file: filePath,
                line: collection.line,
                source: "endpoint",
                collectionSlug: collection.slug,
            });
            debug(
                `Generated custom collection endpoint: ${method} ${routePath}`,
            );
        }
    }

    return handlers;
}

/**
 * Generate routes for a global
 */
function generateGlobalRoutes(
    global: ParsedGlobal,
    apiPrefix: string,
    configFilePath: string,
    rootDir: string,
    debug: DebugLogger,
): PayloadRouteHandler[] {
    const handlers: PayloadRouteHandler[] = [];
    const basePath = `${apiPrefix}/globals/${global.slug}`;

    // Use the global's source file if available, otherwise use config file
    const filePath = global.sourceFile
        ? path.relative(rootDir, global.sourceFile)
        : configFilePath;

    // Standard global operations
    for (const op of GLOBAL_OPERATIONS) {
        const routePath = `${basePath}${op.pathSuffix}`;
        handlers.push({
            path: routePath,
            method: op.method,
            file: filePath,
            line: global.line,
            source: "global",
            headers: op.hasBody
                ? { "Content-Type": "application/json" }
                : undefined,
        });
        debug(`Generated global route: ${op.method} ${routePath}`);
    }

    // Custom global endpoints
    for (const endpoint of global.endpoints) {
        const method = METHOD_MAP[endpoint.method.toLowerCase()];
        if (method) {
            const routePath = `${basePath}${endpoint.path}`;
            handlers.push({
                path: routePath,
                method,
                file: filePath,
                line: global.line,
                source: "endpoint",
            });
            debug(`Generated custom global endpoint: ${method} ${routePath}`);
        }
    }

    return handlers;
}

/**
 * Generate a route for a custom endpoint
 */
function generateEndpointRoute(
    endpoint: { path: string; method: string; root: boolean; line: number },
    apiPrefix: string,
    filePath: string,
    debug: DebugLogger,
): PayloadRouteHandler | null {
    const method = METHOD_MAP[endpoint.method.toLowerCase()];
    if (!method) {
        debug(`Unknown HTTP method: ${endpoint.method}`);
        return null;
    }

    // If root is true, the endpoint is at the server root, not under /api
    const routePath = endpoint.root
        ? endpoint.path
        : `${apiPrefix}${endpoint.path}`;

    debug(`Generated custom endpoint: ${method} ${routePath}`);

    return {
        path: routePath,
        method,
        file: filePath,
        line: endpoint.line,
        source: "endpoint",
    };
}

/**
 * Generate default Payload CMS endpoints (preferences, access, etc.)
 * These endpoints exist on every Payload installation
 */
function generateDefaultEndpoints(
    apiPrefix: string,
    filePath: string,
    debug: DebugLogger,
): PayloadRouteHandler[] {
    const handlers: PayloadRouteHandler[] = [];

    for (const endpoint of DEFAULT_PAYLOAD_ENDPOINTS) {
        const routePath = `${apiPrefix}${endpoint.path}`;
        handlers.push({
            path: routePath,
            method: endpoint.method,
            file: filePath,
            line: 0,
            source: "default",
            headers: endpoint.hasBody
                ? { "Content-Type": "application/json" }
                : undefined,
        });
        debug(`Generated default endpoint: ${endpoint.method} ${routePath}`);
    }

    return handlers;
}

/**
 * Extract a string property from an object literal
 */
function extractStringProperty(
    obj: ObjectLiteralExpression,
    propertyName: string,
): string | undefined {
    const prop = obj.getProperty(propertyName);
    if (!prop || !Node.isPropertyAssignment(prop)) {
        return undefined;
    }

    const initializer = prop.getInitializer();
    if (!initializer) {
        return undefined;
    }

    if (Node.isStringLiteral(initializer)) {
        return initializer.getLiteralValue();
    }

    if (Node.isNoSubstitutionTemplateLiteral(initializer)) {
        return initializer.getLiteralValue();
    }

    return undefined;
}

/**
 * Extract a boolean property from an object literal
 */
function extractBooleanProperty(
    obj: ObjectLiteralExpression,
    propertyName: string,
): boolean {
    const prop = obj.getProperty(propertyName);
    if (!prop || !Node.isPropertyAssignment(prop)) {
        return false;
    }

    const initializer = prop.getInitializer();
    if (!initializer) {
        return false;
    }

    if (Node.isTrueLiteral(initializer)) {
        return true;
    }

    if (Node.isFalseLiteral(initializer)) {
        return false;
    }

    // Check for object literal (e.g., auth: { ... } means auth is enabled)
    if (Node.isObjectLiteralExpression(initializer)) {
        return true;
    }

    return false;
}

/**
 * Convert PayloadRouteHandler to ParsedRoute
 */
function convertToRoutes(
    handlers: PayloadRouteHandler[],
    rootDir: string,
): ParsedRoute[] {
    return handlers.map((handler) => ({
        name: `${handler.method} ${handler.path}`,
        path: handler.path,
        method: handler.method,
        filePath: path.join(rootDir, handler.file),
        type: "payload-cms" as const,
        headers: handler.headers,
        query: handler.queryParams,
        body: handler.bodyExample,
    }));
}
