/**
 * Extension constants
 */

export const EXTENSION_ID = "watchapi-client";
export const EXTENSION_NAME = "WatchAPI";

export const ENV_FILE_NAME = "rest-client.env.json";

// Command IDs (must match package.json)
export const COMMANDS = {
  REFRESH: "watchapi.refresh",
  LOGIN: "watchapi.login",
  LOGOUT: "watchapi.logout",
  OPEN_SETTINGS: "watchapi.openSettings",
  FOCUS: "watchapi.focus",
  OPEN_DASHBOARD: "watchapi.openDashboard",
  ADD_COLLECTION: "watchapi.addCollection",
  DELETE_COLLECTION: "watchapi.deleteCollection",
  ADD_ENDPOINT: "watchapi.addEndpoint",
  EDIT_ENDPOINT: "watchapi.editEndpoint",
  DELETE_ENDPOINT: "watchapi.deleteEndpoint",
  UPLOAD_ENDPOINTS: "watchapi.uploadEndpoints",
  MORE_MENU: "watchapi.moreMenu",
  SWITCH_ORGANIZATION: "watchapi.switchOrganization",
  WARNING: "watchapi.warning",
  EXPORT: "watchapi.export",
} as const;

// View IDs
export const VIEWS = {
  COLLECTIONS: "watchapi.collections",
} as const;

// Storage keys
export const STORAGE_KEYS = {
  JWT_TOKEN: "watchapi.jwt_token",
  REFRESH_TOKEN: "watchapi.refresh_token",
  USER_INFO: "watchapi.user_info",
  SELECTED_ORG_ID: "watchapi.selected_org_id",
  CACHE_PREFIX: "watchapi.cache",
  LAST_SYNC: "watchapi.last_sync",
} as const;

// Sync Configuration
export const SYNC_CONFIG = {
  AUTO_SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
  CACHE_TTL: 10 * 60 * 1000, // 10 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// REST Client Extension
export const REST_CLIENT = {
  EXTENSION_ID: "humao.rest-client",
  NAME: "REST Client",
} as const;

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
