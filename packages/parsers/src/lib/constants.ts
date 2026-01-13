/**
 * Parser constants
 */

// File patterns
export const FILE_PATTERNS = {
	NEXTJS_APP_ROUTES: "**/app/api/**/route.{ts,js}",
	NEXTJS_PAGE_ROUTES: "**/pages/api/**/*.{ts,js}",
	TRPC_ROUTERS: "**/*.router.{ts,js}",
	TRPC_SERVER: "**/server/trpc.{ts,js}",
	NESTJS_CONTROLLERS: "**/*.controller.{ts,js}",
} as const;

// HTTP Methods
export const HTTP_METHODS = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
