/**
 * Parser module barrel export
 * All parsers are environment agnostic - works in CLI, VSCode, or any Node.js context
 */

// Parsers
export {
  parseTRPCRouters,
  hasTRPC,
  getTRPCBasePath,
  type TrpcParseOptions,
  type TrpcParseResult,
} from "./trpc/trpc-parser";

export {
  parseNextAppRoutes,
  hasNextApp,
  type NextAppParseOptions,
  type NextAppParseResult,
  type NextAppRouteHandler,
} from "./next-app/next-app-parser";


// Shared utilities
export * from "./shared/zod-schema-parser";
export * from "./shared/parser-utils";

// Types
export type { ParsedRoute } from "./lib/types";
export type { HttpMethod } from "./lib/constants";
export type {
  TrpcProcedureNode,
  TrpcRouterMeta,
  ProcedureMethod,
  ProcedureVisibility,
} from "./trpc/trpc-types";
