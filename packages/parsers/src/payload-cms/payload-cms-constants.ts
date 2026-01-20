/**
 * Payload CMS parser constants
 */

import type { HttpMethod } from "../lib/constants";

/**
 * Payload CMS dependency names to check for
 */
export const PAYLOAD_DEPENDENCIES = ["payload"] as const;

/**
 * Payload CMS config file patterns
 */
export const PAYLOAD_CONFIG_PATTERNS = [
  "payload.config.ts",
  "payload.config.js",
  "src/payload.config.ts",
  "src/payload.config.js",
  "config/payload.config.ts",
  "config/payload.config.js",
] as const;

/**
 * Collection CRUD operations mapping
 * Maps operation type to HTTP method and path suffix
 * Based on: https://payloadcms.com/docs/rest-api/overview
 */
export const COLLECTION_OPERATIONS: Array<{
  name: string;
  method: HttpMethod;
  pathSuffix: string;
  hasBody: boolean;
}> = [
  { name: "find", method: "GET", pathSuffix: "", hasBody: false },
  { name: "findByID", method: "GET", pathSuffix: "/:id", hasBody: false },
  { name: "count", method: "GET", pathSuffix: "/count", hasBody: false },
  { name: "create", method: "POST", pathSuffix: "", hasBody: true },
  { name: "update", method: "PATCH", pathSuffix: "", hasBody: true },
  { name: "updateByID", method: "PATCH", pathSuffix: "/:id", hasBody: true },
  { name: "delete", method: "DELETE", pathSuffix: "", hasBody: false },
  { name: "deleteByID", method: "DELETE", pathSuffix: "/:id", hasBody: false },
];

/**
 * Additional operations for auth collections
 */
export const AUTH_COLLECTION_OPERATIONS: Array<{
  name: string;
  method: HttpMethod;
  pathSuffix: string;
  hasBody: boolean;
}> = [
  { name: "login", method: "POST", pathSuffix: "/login", hasBody: true },
  { name: "logout", method: "POST", pathSuffix: "/logout", hasBody: false },
  { name: "refresh", method: "POST", pathSuffix: "/refresh-token", hasBody: false },
  { name: "me", method: "GET", pathSuffix: "/me", hasBody: false },
  { name: "forgotPassword", method: "POST", pathSuffix: "/forgot-password", hasBody: true },
  { name: "resetPassword", method: "POST", pathSuffix: "/reset-password", hasBody: true },
  { name: "unlock", method: "POST", pathSuffix: "/unlock", hasBody: true },
  { name: "verifyEmail", method: "POST", pathSuffix: "/verify/:token", hasBody: false },
];

/**
 * Upload collections use standard CRUD operations with multipart/form-data
 * The upload collection marker is used to set the correct Content-Type header
 * No additional endpoints are added for upload collections
 */
export const UPLOAD_COLLECTION_OPERATIONS: Array<{
  name: string;
  method: HttpMethod;
  pathSuffix: string;
  hasBody: boolean;
}> = [];

/**
 * Default Payload CMS endpoints that exist on every installation
 * These are independent of collections and globals
 */
export const DEFAULT_PAYLOAD_ENDPOINTS: Array<{
  name: string;
  method: HttpMethod;
  path: string;
  hasBody: boolean;
  description: string;
}> = [
  // Preferences endpoints
  {
    name: "getPreference",
    method: "GET",
    path: "/payload-preferences/:key",
    hasBody: false,
    description: "Get a user preference by key",
  },
  {
    name: "createPreference",
    method: "POST",
    path: "/payload-preferences/:key",
    hasBody: true,
    description: "Create or update a user preference",
  },
  {
    name: "deletePreference",
    method: "DELETE",
    path: "/payload-preferences/:key",
    hasBody: false,
    description: "Delete a user preference",
  },
  // Access endpoint
  {
    name: "access",
    method: "GET",
    path: "/access",
    hasBody: false,
    description: "Get access control information for current user",
  },
];

/**
 * Global operations (for Payload globals)
 */
export const GLOBAL_OPERATIONS: Array<{
  name: string;
  method: HttpMethod;
  pathSuffix: string;
  hasBody: boolean;
}> = [
  { name: "findOne", method: "GET", pathSuffix: "", hasBody: false },
  { name: "update", method: "POST", pathSuffix: "", hasBody: true },
];

/**
 * HTTP method mapping from lowercase to uppercase
 */
export const METHOD_MAP: Record<string, HttpMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
};
