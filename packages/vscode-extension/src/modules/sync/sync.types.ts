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
    type: "nextjs-app" | "nextjs-page" | "trpc" | "nestjs" | "payload-cms";
    headers?: Record<string, string>;
    query?: Record<string, string>;
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
