/**
 * tRPC parser constants
 */

/**
 * Default patterns for tRPC router files
 */
export const DEFAULT_TRPC_INCLUDE = ['src/server/api/**/*.{ts,tsx}'];

/**
 * Patterns for procedure naming conventions
 */
export const MUTATION_LIKE_NAMES = [/^create/i, /^update/i, /^delete/i, /^set/i];
export const QUERY_LIKE_NAMES = [/^get/i, /^list/i, /^fetch/i];

/**
 * Patterns for sensitive operations
 */
export const SENSITIVE_PROCEDURE_NAMES = /login|password|reset|verify|email/i;

/**
 * Patterns indicating side effects in resolver code
 */
export const SIDE_EFFECT_PATTERNS =
	/sendMail|sendEmail|resend\.|mail\(|writeFile|fs\.|axios\(|fetch\(|update\(|insert\(|delete\(/i;

/**
 * Router factory function names
 */
export const ROUTER_FACTORY_NAMES = ['createTRPCRouter', 'router'];

/**
 * Router identifier pattern
 */
export const ROUTER_IDENTIFIER_PATTERN = /router$/i;
