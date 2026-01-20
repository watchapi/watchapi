/**
 * Payload CMS parser types
 */

import type { HttpMethod } from "../lib/constants";

/**
 * Payload CMS collection definition
 */
export interface PayloadCollection {
  slug: string;
  labels?: {
    singular?: string;
    plural?: string;
  };
  auth?: boolean;
  upload?: boolean;
  versions?: boolean;
  access?: Record<string, unknown>;
}

/**
 * Payload CMS custom endpoint definition
 */
export interface PayloadEndpoint {
  path: string;
  method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
  handler?: unknown;
  root?: boolean;
}

/**
 * Payload CMS route handler (intermediate type before conversion to ParsedRoute)
 */
export interface PayloadRouteHandler {
  path: string;
  method: HttpMethod;
  file: string;
  line: number;
  source: "collection" | "global" | "endpoint" | "default";
  collectionSlug?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyExample?: string;
}

/**
 * Debug logger type
 */
export type DebugLogger = (message: string) => void;
