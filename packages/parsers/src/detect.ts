/**
 * Route detection and parsing utilities
 * Provides simplified API for detecting and parsing routes across all supported frameworks
 */

import type { ParsedRoute, ParserOptions } from "./lib/types";

import { hasNextApp, parseNextAppRoutes } from "./next-app/next-app-parser";
import {
    hasNextPages,
    parseNextPagesRoutes,
} from "./next-pages/next-pages-parser";
import { hasTRPC, parseTRPCRouters } from "./trpc/trpc-parser";
import { hasNestJs, parseNestJsRoutes } from "./nestjs/nestjs-parser";
import {
    hasPayloadCMS,
    parsePayloadCMSRoutes,
} from "./payload-cms/payload-cms-parser";

/**
 * Detected project types
 */
export interface DetectedProjectTypes {
    nextApp: boolean;
    nextPages: boolean;
    trpc: boolean;
    nestjs: boolean;
    payloadCMS: boolean;
}

/**
 * Detection result with parsed routes
 */
export interface DetectAndParseResult {
    detected: DetectedProjectTypes;
    routes: ParsedRoute[];
    /** Debug info about routes found by each parser */
    debug?: {
        nextApp: number;
        nextPages: number;
        trpc: number;
        nestjs: number;
        payloadCMS: number;
    };
}

/**
 * Detect which project types are present in the given directory
 * @param rootDir - The root directory to check
 * @param options - Optional parser options (e.g., custom logger)
 * @returns Object indicating which frameworks are detected
 */
export async function detectRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<DetectedProjectTypes> {
    const [nextApp, nextPages, trpc, nestjs, payloadCMS] = await Promise.all([
        hasNextApp(rootDir, options),
        hasNextPages(rootDir, options),
        hasTRPC(rootDir, options),
        hasNestJs(rootDir, options),
        hasPayloadCMS(rootDir, options),
    ]);

    return {
        nextApp,
        nextPages,
        trpc,
        nestjs,
        payloadCMS,
    };
}

/**
 * Check if any supported project type is detected
 * @param detected - The detection result
 * @returns true if at least one framework is detected
 */
export function hasAnyProjectType(detected: DetectedProjectTypes): boolean {
    return (
        detected.nextApp ||
        detected.nextPages ||
        detected.trpc ||
        detected.nestjs ||
        detected.payloadCMS
    );
}

/**
 * Detect and parse all routes from the given directory
 * This is a convenience function that combines detection and parsing in one call
 * @param rootDir - The root directory to parse routes from
 * @param options - Optional parser options (e.g., custom logger)
 * @returns Detection result and parsed routes
 */
export async function detectAndParseRoutes(
    rootDir: string,
    options?: ParserOptions,
): Promise<DetectAndParseResult> {
    // First detect which frameworks are present
    const detected = await detectRoutes(rootDir, options);

    // Then parse routes only for detected frameworks
    const [
        nextAppRoutes,
        nextPagesRoutes,
        trpcRoutes,
        nestRoutes,
        payloadRoutes,
    ] = await Promise.all([
        detected.nextApp
            ? parseNextAppRoutes(rootDir, options)
            : Promise.resolve([]),
        detected.nextPages
            ? parseNextPagesRoutes(rootDir, options)
            : Promise.resolve([]),
        detected.trpc
            ? parseTRPCRouters(rootDir, options)
            : Promise.resolve([]),
        detected.nestjs
            ? parseNestJsRoutes(rootDir, options)
            : Promise.resolve([]),
        detected.payloadCMS
            ? parsePayloadCMSRoutes(rootDir, options)
            : Promise.resolve([]),
    ]);

    const routes = [
        ...nextAppRoutes,
        ...nextPagesRoutes,
        ...trpcRoutes,
        ...nestRoutes,
        ...payloadRoutes,
    ];

    return {
        detected,
        routes,
        debug: {
            nextApp: nextAppRoutes.length,
            nextPages: nextPagesRoutes.length,
            trpc: trpcRoutes.length,
            nestjs: nestRoutes.length,
            payloadCMS: payloadRoutes.length,
        },
    };
}
