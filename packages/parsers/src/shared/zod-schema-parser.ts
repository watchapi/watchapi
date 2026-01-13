/**
 * Shared Zod schema parser
 * Extracts type information and generates examples from Zod schemas
 * Can be reused across tRPC, Next.js, and other parsers
 */

import { Node, CallExpression, SyntaxKind } from 'ts-morph';

/**
 * Zod type information
 */
export type ZodTypeInfo = {
	kind: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'enum' | 'literal' | 'unknown';
	optional: boolean;
	nullable: boolean;
	defaultValue?: unknown;
	children?: Record<string, ZodTypeInfo>; // for z.object()
	items?: ZodTypeInfo; // for z.array()
	reason?: string; // for kind: 'unknown'
};

/**
 * Extract body structure from Zod schema using AST - 100% deterministic
 */
export function extractBodyFromSchema(schemaNode: Node): string | undefined {
	// If it's a reference (identifier), try to resolve it
	if (Node.isIdentifier(schemaNode)) {
		const resolved = resolveSchemaReference(schemaNode);
		if (resolved) {
			return extractBodyFromSchema(resolved);
		}
		// Can't resolve reference
		return '{}';
	}

	// Extract structured schema info
	const typeInfo = extractZodTypeInfo(schemaNode);

	// Convert to JSON example
	const example = zodTypeInfoToExample(typeInfo);
	if (example !== null && typeof example === 'object' && Object.keys(example).length > 0) {
		return JSON.stringify(example, null, 2);
	}

	return '{}';
}

/**
 * Extract query parameters from Zod schema
 * Converts a Zod object schema into query parameter key-value pairs
 */
export function extractQueryParamsFromSchema(schemaNode: Node): Record<string, string> | undefined {
	// If it's a reference (identifier), try to resolve it
	if (Node.isIdentifier(schemaNode)) {
		const resolved = resolveSchemaReference(schemaNode);
		if (resolved) {
			return extractQueryParamsFromSchema(resolved);
		}
		return undefined;
	}

	// Extract structured schema info
	const typeInfo = extractZodTypeInfo(schemaNode);

	// Only works for objects
	if (typeInfo.kind !== 'object' || !typeInfo.children) {
		return undefined;
	}

	// Convert object fields to query params (primitives only)
	const queryParams: Record<string, string> = {};
	for (const [key, childType] of Object.entries(typeInfo.children)) {
		const value = zodTypeInfoToExample(childType);
		// Only include primitives as query params
		if (value === null || value === undefined) {
			queryParams[key] = '';
		} else if (typeof value === 'object') {
			// Skip complex objects
			continue;
		} else {
			queryParams[key] = String(value);
		}
	}

	return Object.keys(queryParams).length > 0 ? queryParams : undefined;
}

/**
 * Resolve schema reference to its AST node
 */
function resolveSchemaReference(identifier: Node): Node | undefined {
	const schemaName = identifier.getText();
	const sourceFile = identifier.getSourceFile();

	// Look for variable declaration in same file
	const declarations = sourceFile.getVariableDeclarations();
	for (const decl of declarations) {
		if (decl.getName() === schemaName) {
			const initializer = decl.getInitializer();
			if (initializer) {
				return initializer;
			}
		}
	}

	// Look for imported schema
	const importDecls = sourceFile.getImportDeclarations();
	for (const importDecl of importDecls) {
		const namedImports = importDecl.getNamedImports();
		for (const namedImport of namedImports) {
			if (namedImport.getName() === schemaName) {
				const resolvedModule = importDecl.getModuleSpecifierSourceFile();
				if (resolvedModule) {
					// Look for export in imported file
					const exportedDecls = resolvedModule.getVariableDeclarations();
					for (const exportedDecl of exportedDecls) {
						if (exportedDecl.getName() === schemaName) {
							const initializer = exportedDecl.getInitializer();
							if (initializer) {
								return initializer;
							}
						}
					}
				}
			}
		}
	}

	return undefined;
}

/**
 * Extract structured Zod type information from AST node
 * Returns complete type info including modifiers
 */
export function extractZodTypeInfo(node: Node): ZodTypeInfo {
	// Handle CallExpression: z.string(), z.string().optional(), etc.
	if (Node.isCallExpression(node)) {
		const expr = node.getExpression();

		if (Node.isPropertyAccessExpression(expr)) {
			const methodName = expr.getName();
			const base = expr.getExpression();

			// Check if this is a modifier (optional, nullable, default)
			if (methodName === 'optional') {
				const baseType = extractZodTypeInfo(base);
				baseType.optional = true;
				return baseType;
			}

			if (methodName === 'nullable') {
				const baseType = extractZodTypeInfo(base);
				baseType.nullable = true;
				return baseType;
			}

			if (methodName === 'default') {
				const baseType = extractZodTypeInfo(base);
				// Extract default value from argument
				const args = node.getArguments();
				if (args.length > 0) {
					baseType.defaultValue = extractLiteralValue(args[0]);
				}
				return baseType;
			}

			// Check if this is a base Zod type
			if (Node.isIdentifier(base) && base.getText() === 'z') {
				return extractBaseZodType(methodName, node);
			}

			// Chained call - recurse
			if (Node.isCallExpression(base)) {
				return extractZodTypeInfo(base);
			}
		}
	}

	// Unsupported or dynamic construct
	return {
		kind: 'unknown',
		optional: false,
		nullable: false,
		reason: 'unsupported or dynamic Zod construct',
	};
}

/**
 * Extract base Zod type (z.string, z.number, z.object, etc.)
 */
function extractBaseZodType(typeName: string, node: CallExpression): ZodTypeInfo {
	// Supported base types
	switch (typeName) {
		case 'string':
			return { kind: 'string', optional: false, nullable: false };

		case 'number':
			return { kind: 'number', optional: false, nullable: false };

		case 'boolean':
			return { kind: 'boolean', optional: false, nullable: false };

		case 'date':
			return { kind: 'date', optional: false, nullable: false };

		case 'array': {
			// z.array(z.string())
			const args = node.getArguments();
			if (args.length > 0) {
				const items = extractZodTypeInfo(args[0]);
				return { kind: 'array', optional: false, nullable: false, items };
			}
			return { kind: 'array', optional: false, nullable: false };
		}

		case 'object': {
			// z.object({ ... })
			const args = node.getArguments();
			if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
				const children = parseZodObjectLiteral(args[0]);
				return { kind: 'object', optional: false, nullable: false, children };
			}
			return { kind: 'object', optional: false, nullable: false };
		}

		case 'enum':
			return { kind: 'enum', optional: false, nullable: false };

		case 'literal': {
			// z.literal('value')
			const args = node.getArguments();
			if (args.length > 0) {
				const literalValue = extractLiteralValue(args[0]);
				return {
					kind: 'literal',
					optional: false,
					nullable: false,
					defaultValue: literalValue,
				};
			}
			return { kind: 'literal', optional: false, nullable: false };
		}

		default:
			return {
				kind: 'unknown',
				optional: false,
				nullable: false,
				reason: `unsupported Zod type: ${typeName}`,
			};
	}
}

/**
 * Parse z.object({ ... }) object literal
 */
function parseZodObjectLiteral(objectLiteral: Node): Record<string, ZodTypeInfo> {
	if (!Node.isObjectLiteralExpression(objectLiteral)) {
		return {};
	}

	const children: Record<string, ZodTypeInfo> = {};

	for (const prop of objectLiteral.getProperties()) {
		if (!Node.isPropertyAssignment(prop)) {
			continue;
		}

		const nameNode = prop.getNameNode();
		const fieldName = nameNode.getText().replace(/["']/g, '');
		const initializer = prop.getInitializer();

		if (!initializer) {
			continue;
		}

		children[fieldName] = extractZodTypeInfo(initializer);
	}

	return children;
}

/**
 * Extract literal value from AST node (for defaults, enums, literals)
 */
function extractLiteralValue(node: Node): unknown {
	if (Node.isStringLiteral(node)) {
		return node.getLiteralText();
	}
	if (Node.isNumericLiteral(node)) {
		return node.getLiteralValue();
	}
	if (node.getKind() === SyntaxKind.TrueKeyword) {
		return true;
	}
	if (node.getKind() === SyntaxKind.FalseKeyword) {
		return false;
	}
	if (node.getKind() === SyntaxKind.NullKeyword) {
		return null;
	}
	return undefined;
}

/**
 * Convert ZodTypeInfo to example JSON value
 * Respects optional, nullable, and default value modifiers
 */
export function zodTypeInfoToExample(typeInfo: ZodTypeInfo): unknown {
	// If it has a default value, use it
	if (typeInfo.defaultValue !== undefined) {
		return typeInfo.defaultValue;
	}

	// If nullable, return null (nullable takes precedence)
	if (typeInfo.nullable) {
		return null;
	}

	// If optional and no default, omit from example (return undefined)
	// Note: undefined fields will be filtered out when serializing
	if (typeInfo.optional) {
		return undefined;
	}

	// Generate example based on kind
	switch (typeInfo.kind) {
		case 'string':
			return '';

		case 'number':
			return 0;

		case 'boolean':
			return false;

		case 'date':
			return null; // ISO string would be non-deterministic

		case 'array':
			// Return empty array or array with one example item
			if (typeInfo.items) {
				const itemExample = zodTypeInfoToExample(typeInfo.items);
				return itemExample !== undefined ? [itemExample] : [];
			}
			return [];

		case 'object':
			if (typeInfo.children) {
				const obj: Record<string, unknown> = {};
				for (const [key, childType] of Object.entries(typeInfo.children)) {
					const value = zodTypeInfoToExample(childType);
					// Only include non-undefined values (skip optional fields)
					if (value !== undefined) {
						obj[key] = value;
					}
				}
				return obj;
			}
			return {};

		case 'enum':
			return null; // Can't determine enum values deterministically

		case 'literal':
			return typeInfo.defaultValue ?? null;

		case 'unknown':
			return null;

		default:
			return null;
	}
}
