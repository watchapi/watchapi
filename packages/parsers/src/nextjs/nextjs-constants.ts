/**
 * Next.js parser constants
 */

import type { HttpMethod } from '../lib/constants';

/**
 * HTTP methods supported by Next.js App Router
 */
export const APP_ROUTER_METHODS: HttpMethod[] = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
];

/**
 * Special Next.js route file names
 */
export const SPECIAL_FILES = [
	'route.ts',
	'route.js',
	'page.ts',
	'page.js',
	'layout.ts',
	'layout.js',
	'middleware.ts',
	'middleware.js',
];

/**
 * App Router specific exports
 */
export const APP_ROUTER_EXPORTS = [
	...APP_ROUTER_METHODS,
	'generateStaticParams',
	'generateMetadata',
	'generateViewport',
];

/**
 * Pages Router handler patterns
 */
export const PAGES_ROUTER_HANDLERS = [
	'handler',
	'default',
	'getServerSideProps',
	'getStaticProps',
	'getStaticPaths',
];

/**
 * Patterns indicating database usage
 */
export const DB_PATTERNS = /\b(prisma\.|drizzle\.|db\.|query\(|execute\(|sql`|fetch\()/;

/**
 * Patterns indicating validation
 */
export const VALIDATION_PATTERNS = /\b(zod|yup|joi|validator|validate|schema|parse)/i;

/**
 * Patterns indicating error handling
 */
export const ERROR_PATTERNS = /(try\s*\{|catch\s*\(|throw\s+new|\.catch\(|NextResponse\.error|\.status\(4|\.status\(5)/;

/**
 * Patterns for Next.js Response objects
 */
export const RESPONSE_PATTERNS = /(NextResponse|Response)\.(json|redirect|rewrite|next)/;

/**
 * Patterns for middleware
 */
export const MIDDLEWARE_PATTERNS = /middleware|NextRequest|NextResponse/;

/**
 * Reserved Next.js dynamic segments
 */
export const RESERVED_SEGMENTS = new Set([
	'_app',
	'_document',
	'_error',
	'404',
	'500',
]);

/**
 * Dynamic route segment patterns
 */
export const DYNAMIC_SEGMENT_REGEX = /\[([^\]]+)\]/g;
export const CATCH_ALL_REGEX = /\[\.\.\.([^\]]+)\]/;
export const OPTIONAL_CATCH_ALL_REGEX = /\[\[\.\.\.([^\]]+)\]\]/;
