/**
 * NestJS parser types
 */

import type { HttpMethod } from "../lib/constants";

export interface NestJsRouteHandler {
  path: string;
  method: HttpMethod;
  file: string;
  line: number;
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyExample?: string;
}

export type DebugLogger = (message: string) => void;
