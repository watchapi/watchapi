/**
 * NestJS route parser with AST-based detection
 * Parses controllers and DTOs to extract routes and request body schemas
 * Note: This module is decoupled from vscode - all functions accept rootDir as parameter
 */

import {
    Decorator,
    MethodDeclaration,
    Node,
    ParameterDeclaration,
    PropertyAccessExpression,
    SourceFile,
    SyntaxKind,
    ts,
    Type,
} from "ts-morph";

import { FILE_PATTERNS } from "../lib/constants";
import type { ParsedRoute, ParserOptions } from "../lib/types";
import type { HttpMethod } from "../lib/constants";
import { BaseParser } from "../shared/base-parser";

import {
    NESTJS_BODY_DECORATOR,
    NESTJS_CONTROLLER_DECORATOR,
    NESTJS_HEADER_DECORATOR,
    NESTJS_METHOD_DECORATORS,
    NESTJS_QUERY_DECORATOR,
} from "./nestjs-constants";
import type { NestJsRouteHandler } from "./nestjs-types";

/**
 * NestJS Parser class for extracting routes from NestJS controllers
 */
export class NestJsParser extends BaseParser {
    private globalPrefix?: string;

    constructor(rootDir: string, options?: ParserOptions) {
        super(
            rootDir,
            {
                name: "NestJS",
                debugPrefix: "nestjs:parser",
                dependencies: ["@nestjs/core", "@nestjs/common"],
                filePatterns: [FILE_PATTERNS.NESTJS_CONTROLLERS],
                requiresTsConfig: false,
            },
            options,
        );
    }

    /**
     * Parse NestJS routes from controllers
     */
    protected async parseRoutes(): Promise<ParsedRoute[]> {
        // Find global prefix from main.ts
        this.globalPrefix = await this.findGlobalPrefix();

        const sourceFiles = this.getSourceFiles();
        this.debug(`Found ${sourceFiles.length} controller file(s)`);

        const handlers: NestJsRouteHandler[] = [];

        for (const file of sourceFiles) {
            this.debug(
                `Scanning file ${this.relativePath(file.getFilePath())}`,
            );
            handlers.push(...this.parseControllerFile(file));
        }

        return this.convertToRoutes(handlers);
    }

    /**
     * Find the global API prefix from main.ts
     */
    private async findGlobalPrefix(): Promise<string | undefined> {
        const candidates = ["src/main.ts", "main.ts"].map((file) =>
            this.joinPath(file),
        );

        for (const filePath of candidates) {
            if (!(await this.fileExists(filePath))) {
                continue;
            }

            try {
                const sourceFile =
                    this.project!.getSourceFile(filePath) ??
                    this.project!.addSourceFileAtPath(filePath);
                const prefix = this.extractGlobalPrefix(sourceFile);
                if (prefix) {
                    this.debug(`Detected NestJS global prefix: ${prefix}`);
                    return prefix;
                }
            } catch (error) {
                this.debug(
                    `Failed to read global prefix from ${filePath}: ${error}`,
                );
            }
        }

        return undefined;
    }

    /**
     * Extract global prefix from a source file
     */
    private extractGlobalPrefix(sourceFile: SourceFile): string | undefined {
        const calls = sourceFile.getDescendantsOfKind(
            SyntaxKind.CallExpression,
        );

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

            const prefix = this.resolveStringLiteral(args[0]);
            if (prefix) {
                return prefix;
            }
        }

        return undefined;
    }

    /**
     * Parse a single controller file
     */
    private parseControllerFile(sourceFile: SourceFile): NestJsRouteHandler[] {
        const handlers: NestJsRouteHandler[] = [];

        for (const classDecl of sourceFile.getClasses()) {
            const controllerDecorator = classDecl.getDecorator(
                NESTJS_CONTROLLER_DECORATOR,
            );
            if (!controllerDecorator) {
                continue;
            }

            const controllerConfig =
                this.extractControllerConfig(controllerDecorator);
            const normalizedControllerPaths =
                controllerConfig.paths.length > 0
                    ? controllerConfig.paths
                    : [""];

            for (const method of classDecl.getMethods()) {
                const routeDecorators = this.getRouteDecorators(method);
                if (routeDecorators.length === 0) {
                    continue;
                }

                const methodVersions = this.extractMethodVersions(method);
                const methodHeaders = this.extractHeadersFromMethod(method);
                const bodyExample = this.extractBodyExample(method);
                const queryParams = this.extractQueryExample(method);

                for (const routeDecorator of routeDecorators) {
                    const decoratorPaths = this.extractDecoratorPaths(
                        routeDecorator.decorator,
                    );
                    const normalizedPaths =
                        decoratorPaths.length > 0 ? decoratorPaths : [""];

                    for (const controllerPath of normalizedControllerPaths) {
                        for (const decoratorPath of normalizedPaths) {
                            const routePaths = this.buildRoutePaths(
                                controllerPath,
                                decoratorPath,
                                methodVersions.length > 0
                                    ? methodVersions
                                    : controllerConfig.versions,
                            );

                            for (const methodName of routeDecorator.methods) {
                                for (const routePath of routePaths) {
                                    const effectiveBody =
                                        bodyExample &&
                                        this.shouldIncludeBody(methodName)
                                            ? bodyExample
                                            : undefined;

                                    // Auto-add Content-Type for JSON bodies
                                    const finalHeaders = { ...methodHeaders };
                                    if (
                                        effectiveBody &&
                                        !finalHeaders["Content-Type"]
                                    ) {
                                        finalHeaders["Content-Type"] =
                                            "application/json";
                                    }

                                    handlers.push({
                                        path: routePath,
                                        method: methodName,
                                        file: this.relativePath(
                                            sourceFile.getFilePath(),
                                        ),
                                        line: method.getStartLineNumber(),
                                        headers: finalHeaders,
                                        queryParams: queryParams,
                                        bodyExample: effectiveBody,
                                    });

                                    this.debug(
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

    /**
     * Get route decorators from a method
     */
    private getRouteDecorators(
        method: MethodDeclaration,
    ): Array<{ decorator: Decorator; methods: HttpMethod[] }> {
        const decorators = method.getDecorators();
        const results: Array<{ decorator: Decorator; methods: HttpMethod[] }> =
            [];

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

    /**
     * Extract controller configuration from decorator
     */
    private extractControllerConfig(decorator: Decorator): {
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
                    ? this.extractPathsFromNode(
                          pathProp.getInitializer() ?? firstArg,
                      )
                    : [""];

            const versions =
                versionProp && Node.isPropertyAssignment(versionProp)
                    ? this.extractVersionsFromNode(
                          versionProp.getInitializer() ?? firstArg,
                      )
                    : [];

            return { paths: paths.length > 0 ? paths : [""], versions };
        }

        return { paths: this.extractPathsFromNode(firstArg), versions: [] };
    }

    /**
     * Extract paths from decorator arguments
     */
    private extractDecoratorPaths(decorator: Decorator): string[] {
        const callExpression = decorator.getCallExpression();
        if (!callExpression) {
            return [""];
        }

        const args = callExpression.getArguments();
        if (args.length === 0) {
            return [""];
        }

        return this.extractPathsFromNode(args[0]);
    }

    /**
     * Extract paths from a node
     */
    private extractPathsFromNode(node: Node): string[] {
        const literal = this.resolveStringLiteral(node);
        if (literal !== undefined) {
            return [literal];
        }

        if (Node.isArrayLiteralExpression(node)) {
            const paths: string[] = [];
            node.getElements().forEach((element) => {
                paths.push(...this.extractPathsFromNode(element));
            });
            return paths;
        }

        if (Node.isObjectLiteralExpression(node)) {
            const prop = node.getProperty("path");
            if (prop && Node.isPropertyAssignment(prop)) {
                const initializer = prop.getInitializer();
                if (initializer) {
                    return this.extractPathsFromNode(initializer);
                }
            }
        }

        return [""];
    }

    /**
     * Extract versions from a node
     */
    private extractVersionsFromNode(node: Node): string[] {
        const literal = this.resolveStringLiteral(node);
        if (literal !== undefined) {
            return [literal];
        }

        if (Node.isArrayLiteralExpression(node)) {
            const versions: string[] = [];
            node.getElements().forEach((element) => {
                versions.push(...this.extractVersionsFromNode(element));
            });
            return versions;
        }

        return [];
    }

    /**
     * Build route paths with all combinations
     */
    private buildRoutePaths(
        controllerPath: string,
        methodPath: string,
        versions?: string[],
    ): string[] {
        const normalize = (value: string): string =>
            value.replace(/^\/*/, "").replace(/\/*$/, "");

        const versionPrefixes = this.normalizeVersions(versions);

        const buildPath = (versionPrefix: string): string => {
            const parts = [
                this.globalPrefix ?? "",
                versionPrefix,
                controllerPath,
                methodPath,
            ]
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

    /**
     * Extract headers from method decorators
     */
    private extractHeadersFromMethod(
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

            const key = this.resolveStringLiteral(args[0]);
            const value = this.resolveStringLiteral(args[1]);

            if (key && value) {
                headers[key] = value;
            }
        }

        return headers;
    }

    /**
     * Extract body example from method parameters
     * Type-first approach: use TypeScript type to determine structure,
     * decorators only for enrichment (key names)
     */
    private extractBodyExample(method: MethodDeclaration): string | undefined {
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

            // Type-first: determine the nature of the type BEFORE generating example
            const typeClassification = this.classifyType(paramType);

            const example = this.typeToExample(
                paramType,
                entry.param,
                0,
                new Set(),
            );

            // Decorator-second: only used for key enrichment
            const decoratorArg = entry.decorator
                .getCallExpression()
                ?.getArguments()[0];
            const bodyKey = decoratorArg
                ? this.resolveStringLiteral(decoratorArg)
                : undefined;

            // If decorator provides a key, use it regardless of type
            if (bodyKey) {
                bodyObject[bodyKey] = example;
                hasObjectBody = true;
                continue;
            }

            // Use type classification (not runtime typeof) to determine handling
            if (typeClassification === "object") {
                // Object types: merge properties into body object
                if (
                    example &&
                    typeof example === "object" &&
                    !Array.isArray(example)
                ) {
                    Object.assign(bodyObject, example);
                    hasObjectBody = true;
                }
            } else {
                // Primitives, arrays, and other types: treat as the whole body
                primitiveBody = example;
            }
        }

        const bodyExample = hasObjectBody
            ? JSON.stringify(bodyObject, null, 2)
            : primitiveBody !== undefined
              ? JSON.stringify(primitiveBody, null, 2)
              : undefined;

        if (!bodyExample) {
            this.debug("Failed to build NestJS body example");
            return undefined;
        }

        return bodyExample;
    }

    /**
     * Classify a type as 'primitive', 'array', or 'object'
     * Uses TypeScript type system, not runtime checks
     */
    private classifyType(
        type: Type,
    ): "primitive" | "array" | "object" | "unknown" {
        // Handle union types - unwrap to find the actual type
        if (type.isUnion()) {
            const candidates = type
                .getUnionTypes()
                .filter((member) => !member.isUndefined() && !member.isNull());
            if (candidates.length === 0) {
                return "unknown";
            }
            // If all candidates are the same classification, use that
            const classifications = candidates.map((t) => this.classifyType(t));
            const unique = [...new Set(classifications)];
            if (unique.length === 1) {
                return unique[0];
            }
            // Mixed types - treat as unknown (will be handled as primitive body)
            return "unknown";
        }

        // Check primitives first (before object check)
        if (this.isPrimitiveType(type)) {
            return "primitive";
        }

        // Check array
        if (type.isArray()) {
            return "array";
        }

        // Check for built-in types that serialize as primitives (Date, etc.)
        if (type.isObject()) {
            const typeText = type.getText();
            if (this.isBuiltinPrimitiveType(typeText)) {
                return "primitive";
            }
            return "object";
        }

        return "unknown";
    }

    /**
     * Check if a type text represents a built-in type that serializes as a primitive
     */
    private isBuiltinPrimitiveType(typeText: string): boolean {
        const normalized = typeText
            .replace(/^import\([^)]+\)\./, "")
            .replace(/<[^>]+>$/, "")
            .trim();

        return (
            normalized === "Date" ||
            normalized === "DateTime" ||
            normalized === "RegExp" ||
            normalized === "File" ||
            normalized === "Blob" ||
            normalized === "Buffer"
        );
    }

    /**
     * Get example value for well-known built-in types
     * Returns undefined if the type is not a known built-in
     */
    private getBuiltinTypeExample(typeText: string): unknown | undefined {
        // Normalize type text (remove import paths, generics, etc.)
        const normalized = typeText
            .replace(/^import\([^)]+\)\./, "") // Remove import() prefix
            .replace(/<[^>]+>$/, "") // Remove generic params
            .trim();

        // Date types
        if (normalized === "Date" || normalized === "DateTime") {
            return "{{$timestamp}}";
        }

        // File/Blob types (common in upload endpoints)
        if (
            normalized === "File" ||
            normalized === "Blob" ||
            normalized === "Buffer"
        ) {
            return "<binary>";
        }

        // ReadableStream types
        if (normalized.includes("ReadableStream") || normalized.includes("Stream")) {
            return "<stream>";
        }

        // Express/NestJS specific types that shouldn't be serialized
        if (
            normalized === "Request" ||
            normalized === "Response" ||
            normalized === "Express.Request" ||
            normalized === "Express.Response"
        ) {
            return undefined;
        }

        // FormData
        if (normalized === "FormData") {
            return { field: "<value>" };
        }

        // RegExp
        if (normalized === "RegExp") {
            return "/.*/";
        }

        // Map and Set
        if (normalized === "Map" || normalized.startsWith("Map<")) {
            return {};
        }
        if (normalized === "Set" || normalized.startsWith("Set<")) {
            return [];
        }

        // Promise - unwrap (though this shouldn't normally appear in DTOs)
        if (normalized.startsWith("Promise<")) {
            return {};
        }

        return undefined;
    }

    /**
     * Check if a type is a primitive type using TypeScript type system
     * This is the source of truth for type classification
     */
    private isPrimitiveType(type: Type): boolean {
        // Check for literal types first
        if (type.getLiteralValue() !== undefined) {
            return true;
        }

        // Check TypeScript type flags for primitives
        const flags = type.getFlags();

        // String, Number, Boolean, BigInt, Undefined, Null are primitives
        if (
            flags & ts.TypeFlags.String ||
            flags & ts.TypeFlags.Number ||
            flags & ts.TypeFlags.Boolean ||
            flags & ts.TypeFlags.BigInt ||
            flags & ts.TypeFlags.Undefined ||
            flags & ts.TypeFlags.Null ||
            flags & ts.TypeFlags.StringLiteral ||
            flags & ts.TypeFlags.NumberLiteral ||
            flags & ts.TypeFlags.BooleanLiteral ||
            flags & ts.TypeFlags.BigIntLiteral
        ) {
            return true;
        }

        // Also check ts-morph convenience methods
        if (
            type.isString() ||
            type.isNumber() ||
            type.isBoolean() ||
            type.isBooleanLiteral() ||
            type.isStringLiteral() ||
            type.isNumberLiteral() ||
            type.isUndefined() ||
            type.isNull()
        ) {
            return true;
        }

        return false;
    }

    /**
     * Extract query parameters from method
     * Type-first approach: use TypeScript type to determine structure,
     * decorators only for enrichment (key names)
     */
    private extractQueryExample(
        method: MethodDeclaration,
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

            // Type-first: determine the nature of the type BEFORE generating example
            const typeClassification = this.classifyType(paramType);

            const example = this.typeToExample(
                paramType,
                entry.param,
                0,
                new Set(),
            );

            // Decorator-second: only used for key enrichment
            const decoratorArg = entry.decorator
                .getCallExpression()
                ?.getArguments()[0];
            const queryKey = decoratorArg
                ? this.resolveStringLiteral(decoratorArg)
                : undefined;

            // If decorator provides a key, use it regardless of type
            if (queryKey) {
                const serialized = this.serializeQueryValue(example);
                if (serialized !== "") {
                    queryObject[queryKey] = serialized;
                }
                continue;
            }

            // Use type classification to determine handling
            if (typeClassification === "object") {
                // Object types (DTOs): expand properties into query object
                if (
                    example &&
                    typeof example === "object" &&
                    !Array.isArray(example)
                ) {
                    for (const [key, value] of Object.entries(example)) {
                        const serialized = this.serializeQueryValue(value);
                        if (serialized !== "") {
                            queryObject[key] = serialized;
                        }
                    }
                }
            }
            // Primitives and arrays without a key are not valid query params
        }

        if (Object.keys(queryObject).length === 0) {
            this.debug("No query parameters found");
            return undefined;
        }

        return queryObject;
    }

    /**
     * Serialize a value for query string
     */
    private serializeQueryValue(value: unknown): string {
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
            if (value.length === 0) {
                return "";
            }
            return value.map((v) => this.serializeQueryValue(v)).join(",");
        }

        if (typeof value === "object") {
            if (Object.keys(value).length === 0) {
                return "";
            }
            return "";
        }

        return String(value);
    }

    /**
     * Convert a TypeScript type to an example value
     * Type-first approach: always check primitives before objects
     */
    private typeToExample(
        type: Type,
        location: Node,
        depth: number,
        visited: Set<string>,
    ): unknown {
        if (depth > 3) {
            return {};
        }

        // 1. Handle literal values first (string, number, boolean literals)
        const literalValue = type.getLiteralValue();
        if (literalValue !== undefined) {
            return literalValue;
        }

        // 2. Handle boolean literal types (true/false as types)
        if (type.isBooleanLiteral()) {
            // The text will be "true" or "false"
            return type.getText() === "true";
        }

        // 3. Handle primitive types using type flags (most reliable method)
        const flags = type.getFlags();

        if (flags & ts.TypeFlags.String || type.isString()) {
            return "";
        }
        if (flags & ts.TypeFlags.Number || type.isNumber()) {
            return 0;
        }
        if (flags & ts.TypeFlags.Boolean || type.isBoolean()) {
            return false;
        }
        if (flags & ts.TypeFlags.BigInt) {
            return 0;
        }
        if (flags & ts.TypeFlags.Undefined || type.isUndefined()) {
            return undefined;
        }
        if (flags & ts.TypeFlags.Null || type.isNull()) {
            return null;
        }

        // 4. Handle any/unknown
        if (type.isAny() || type.isUnknown()) {
            return {};
        }

        // 5. Handle arrays before objects (arrays are also objects in TS)
        if (type.isArray()) {
            const element = type.getArrayElementType();
            if (!element) {
                return [];
            }
            return [this.typeToExample(element, location, depth + 1, visited)];
        }

        // 6. Handle unions - pick first non-null, non-undefined type
        if (type.isUnion()) {
            const candidates = type
                .getUnionTypes()
                .filter((member) => !member.isUndefined() && !member.isNull());
            if (candidates.length > 0) {
                return this.typeToExample(
                    candidates[0],
                    location,
                    depth + 1,
                    visited,
                );
            }
            return undefined;
        }

        // 7. Handle enums
        if (type.isEnum() || type.isEnumLiteral()) {
            const text = type.getText(location);
            return text.split(".").pop() ?? text;
        }

        // 8. Handle object types LAST (after all primitive checks)
        if (type.isObject()) {
            const typeText = type.getText(location);

            // Handle well-known built-in types
            const builtinExample = this.getBuiltinTypeExample(typeText);
            if (builtinExample !== undefined) {
                return builtinExample;
            }

            const key = typeText;
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

                const declaration =
                    prop.getValueDeclaration() ?? prop.getDeclarations()[0];
                if (
                    declaration &&
                    (Node.isMethodDeclaration(declaration) ||
                        Node.isMethodSignature(declaration))
                ) {
                    continue;
                }
                const propType = prop.getTypeAtLocation(
                    declaration ?? location,
                );
                objectValue[name] = this.typeToExample(
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

    /**
     * Extract a string literal from a node
     */
    private extractStringLiteral(node: Node): string | undefined {
        if (
            Node.isStringLiteral(node) ||
            Node.isNoSubstitutionTemplateLiteral(node)
        ) {
            return node.getLiteralValue();
        }
        return undefined;
    }

    /**
     * Check if the HTTP method should include a body
     */
    private shouldIncludeBody(method: HttpMethod): boolean {
        return ["POST", "PUT", "PATCH"].includes(method);
    }

    /**
     * Convert handlers to ParsedRoute format
     */
    private convertToRoutes(handlers: NestJsRouteHandler[]): ParsedRoute[] {
        return handlers.map((handler) => ({
            name: `${handler.method} ${handler.path}`,
            path: handler.path,
            method: handler.method,
            filePath: this.joinPath(handler.file),
            line: handler.line,
            type: "nestjs" as const,
            headers:
                Object.keys(handler.headers).length > 0
                    ? handler.headers
                    : undefined,
            query: handler.queryParams,
            body: handler.bodyExample,
        }));
    }

    /**
     * Extract method-level version decorators
     */
    private extractMethodVersions(method: MethodDeclaration): string[] {
        const decorator = method.getDecorator("Version");
        if (!decorator) {
            return [];
        }

        const callExpression = decorator.getCallExpression();
        const args = callExpression?.getArguments() ?? [];
        if (args.length === 0) {
            return [];
        }

        return this.extractVersionsFromNode(args[0]);
    }

    /**
     * Normalize version strings
     */
    private normalizeVersions(versions?: string[]): string[] {
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

    /**
     * Resolve a string literal, following references if needed
     */
    private resolveStringLiteral(node: Node): string | undefined {
        const literal = this.extractStringLiteral(node);
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
                        const resolved = this.extractStringLiteral(initializer);
                        if (resolved !== undefined) {
                            return resolved;
                        }
                    }
                }

                if (Node.isEnumMember(declaration)) {
                    const initializer = declaration.getInitializer();
                    if (initializer) {
                        const resolved = this.extractStringLiteral(initializer);
                        if (resolved !== undefined) {
                            return resolved;
                        }
                    }
                }
            }
        }

        if (Node.isPropertyAccessExpression(node)) {
            return this.resolvePropertyAccessString(node);
        }

        const type = node.getType();
        const literalValue = type.getLiteralValue();
        if (typeof literalValue === "string") {
            return literalValue;
        }

        return undefined;
    }

    /**
     * Resolve a property access expression to a string
     */
    private resolvePropertyAccessString(
        node: PropertyAccessExpression,
    ): string | undefined {
        const symbol = node.getSymbol();
        const declarations = symbol?.getDeclarations() ?? [];
        for (const declaration of declarations) {
            if (Node.isEnumMember(declaration)) {
                const initializer = declaration.getInitializer();
                if (initializer) {
                    const resolved = this.extractStringLiteral(initializer);
                    if (resolved !== undefined) {
                        return resolved;
                    }
                }
            }
        }

        return undefined;
    }
}

// =============================================================================
// Backward-compatible function exports
// =============================================================================

/**
 * Detect if directory has NestJS
 * @param rootDir - The root directory to check
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function hasNestJs(
    rootDir: string,
    options?: ParserOptions,
): Promise<boolean> {
    const parser = new NestJsParser(rootDir, options);
    return parser.detect();
}

/**
 * Parse NestJS controllers using AST analysis
 * @param rootDir - The root directory to parse routes from
 * @param options - Optional parser options (e.g., custom logger)
 */
export async function parseNestJsRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<ParsedRoute[]> {
    const parser = new NestJsParser(rootDir, options);
    return parser.parse();
}
