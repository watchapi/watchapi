/**
 * Sync-related types
 */

import { HttpMethod } from "@/shared/constants";

// Parsed route types (for Next.js/tRPC detection)
export interface ParsedRoute {
    name: string;
    path: string;
    method: HttpMethod;
    filePath: string;
    handlerName?: string; // For generating stable externalId
    line?: number; // Source line number (1-based) for navigation
    type: "nextjs-app" | "nextjs-page" | "trpc" | "nestjs" | "payload-cms";
    headers?: Record<string, string>;
    query?: Record<string, string>;
    directives?: { varName: string; responsePath: string }[];
    body?: string;
}

// Cache types
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// Sync state
export interface SyncState {
    isSyncing: boolean;
    lastSyncTime?: number;
    error?: string;
}
