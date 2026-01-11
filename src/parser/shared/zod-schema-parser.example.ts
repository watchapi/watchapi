/**
 * Example usage of zod-schema-parser for Next.js and other parsers
 *
 * This file demonstrates how to use the shared Zod parser
 * in different contexts (tRPC, Next.js, etc.)
 */

/**
 * Example 1: Extract body from Next.js API route with Zod validation
 *
 * Given a Next.js route like:
 * ```typescript
 * const createUserSchema = z.object({
 *   name: z.string(),
 *   email: z.string().email(),
 *   age: z.number().optional()
 * });
 *
 * export async function POST(request: Request) {
 *   const body = await request.json();
 *   const validated = createUserSchema.parse(body);
 *   // ...
 * }
 * ```
 *
 * Usage:
 * ```typescript
 * // When you find a schema reference in the AST
 * const schemaNode: Node = ...; // The createUserSchema variable
 * const bodyExample = extractBodyFromSchema(schemaNode);
 * // Result: '{\n  "name": "",\n  "email": "",\n  "age": 0\n}'
 * ```
 */

/**
 * Example 2: Extract query params from Next.js route with Zod
 *
 * Given a Next.js route like:
 * ```typescript
 * const searchParamsSchema = z.object({
 *   page: z.number(),
 *   limit: z.number(),
 *   search: z.string().optional()
 * });
 *
 * export async function GET(request: Request) {
 *   const { searchParams } = new URL(request.url);
 *   const validated = searchParamsSchema.parse({
 *     page: Number(searchParams.get('page')),
 *     limit: Number(searchParams.get('limit')),
 *     search: searchParams.get('search')
 *   });
 *   // ...
 * }
 * ```
 *
 * Usage:
 * ```typescript
 * const schemaNode: Node = ...; // The searchParamsSchema variable
 * const queryParams = extractQueryParamsFromSchema(schemaNode);
 * // Result: { page: "0", limit: "0", search: "" }
 * ```
 */

/**
 * Example 3: Detect Zod schemas in Next.js routes
 *
 * How to find and extract Zod schemas in a Next.js route file:
 *
 * ```typescript
 * import { SourceFile, Node } from 'ts-morph';
 *
 * function extractZodSchemasFromNextRoute(sourceFile: SourceFile) {
 *   const bodySchemas = new Map<string, string>();
 *   const querySchemas = new Map<string, Record<string, string>>();
 *
 *   // Find all variable declarations
 *   const declarations = sourceFile.getVariableDeclarations();
 *
 *   for (const decl of declarations) {
 *     const name = decl.getName();
 *     const initializer = decl.getInitializer();
 *
 *     if (!initializer) continue;
 *
 *     // Check if it looks like a Zod schema
 *     const text = initializer.getText();
 *     if (text.includes('z.object')) {
 *       // Try to extract body example
 *       const bodyExample = extractBodyFromSchema(initializer);
 *       if (bodyExample) {
 *         bodySchemas.set(name, bodyExample);
 *       }
 *
 *       // Try to extract query params
 *       const queryParams = extractQueryParamsFromSchema(initializer);
 *       if (queryParams) {
 *         querySchemas.set(name, queryParams);
 *       }
 *     }
 *   }
 *
 *   return { bodySchemas, querySchemas };
 * }
 * ```
 */

/**
 * Example 4: Link schema to route handler
 *
 * How to determine which schema is used by which route handler:
 *
 * ```typescript
 * function findSchemaForHandler(handler: Node, sourceFile: SourceFile) {
 *   const handlerText = handler.getText();
 *
 *   // Look for .parse() or .safeParse() calls
 *   const parseMatches = handlerText.match(/(\w+)\.(?:safe)?parse\(/g);
 *   if (!parseMatches) return null;
 *
 *   // Extract schema name
 *   const schemaName = parseMatches[0].replace('.parse(', '').replace('.safeParse(', '');
 *
 *   // Find the schema variable
 *   const declarations = sourceFile.getVariableDeclarations();
 *   for (const decl of declarations) {
 *     if (decl.getName() === schemaName) {
 *       const initializer = decl.getInitializer();
 *       if (initializer) {
 *         return {
 *           name: schemaName,
 *           bodyExample: extractBodyFromSchema(initializer),
 *           queryParams: extractQueryParamsFromSchema(initializer)
 *         };
 *       }
 *     }
 *   }
 *
 *   return null;
 * }
 * ```
 */

// This file is documentation only - no exports
export {};
