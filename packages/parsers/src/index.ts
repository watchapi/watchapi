/**
 * Parser module barrel export
 */

// Individual parsers
export * from "./next-app/next-app-parser";
export * from "./next-pages/next-pages-parser";
export * from "./nestjs/nestjs-parser";
export * from "./trpc/trpc-parser";
export * from "./payload-cms/payload-cms-parser";
export * from "./shared/zod-schema-parser";

// Base parser class for extending
export { BaseParser } from "./shared/base-parser";
export type { BaseParserConfig, DebugLogger } from "./shared/base-parser";

// Detection and parsing utilities
export * from "./detect";

// Types
export type { ParsedRoute, ParserOptions } from "./lib/types";

// Logger exports for custom output handlers (e.g., VSCode OutputChannel)
export { Logger, LogLevel } from "./lib/logger";
export type { LogOutput, LoggerConfig } from "./lib/logger";
