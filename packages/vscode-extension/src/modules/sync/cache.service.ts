/**
 * Cache service
 * Implements hybrid caching (memory + workspace storage)
 */

import * as vscode from 'vscode';
import { logger } from '@/shared/logger';
import { STORAGE_KEYS, SYNC_CONFIG } from '@/shared/constants';
import type { CacheEntry } from './sync.types';

export class CacheService {
	private context: vscode.ExtensionContext;
	private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Get cached value
	 */
	async get<T>(key: string): Promise<T | undefined> {
		try {
			// Check memory cache first
			const memoryEntry = this.memoryCache.get(key);
			if (memoryEntry && !this.isExpired(memoryEntry)) {
				logger.debug(`Cache hit (memory): ${key}`);
				return memoryEntry.data as T;
			}

			// Check workspace storage
			const storageKey = `${STORAGE_KEYS.CACHE_PREFIX}.${key}`;
			const storageEntry = this.context.workspaceState.get<CacheEntry<T>>(storageKey);

			if (storageEntry && !this.isExpired(storageEntry)) {
				logger.debug(`Cache hit (storage): ${key}`);
				// Promote to memory cache
				this.memoryCache.set(key, storageEntry as CacheEntry<unknown>);
				return storageEntry.data;
			}

			logger.debug(`Cache miss: ${key}`);
			return undefined;
		} catch (error) {
			logger.error(`Cache get error: ${key}`, error);
			return undefined;
		}
	}

	/**
	 * Set cached value
	 */
	async set<T>(key: string, data: T, ttl: number = SYNC_CONFIG.CACHE_TTL): Promise<void> {
		try {
			const entry: CacheEntry<T> = {
				data,
				timestamp: Date.now(),
				ttl,
			};

			// Store in memory
			this.memoryCache.set(key, entry as CacheEntry<unknown>);

			// Store in workspace storage for persistence
			const storageKey = `${STORAGE_KEYS.CACHE_PREFIX}.${key}`;
			await this.context.workspaceState.update(storageKey, entry);

			logger.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
		} catch (error) {
			logger.error(`Cache set error: ${key}`, error);
		}
	}

	/**
	 * Delete cached value
	 */
	async delete(key: string): Promise<void> {
		try {
			// Remove from memory
			this.memoryCache.delete(key);

			// Remove from storage
			const storageKey = `${STORAGE_KEYS.CACHE_PREFIX}.${key}`;
			await this.context.workspaceState.update(storageKey, undefined);

			logger.debug(`Cache deleted: ${key}`);
		} catch (error) {
			logger.error(`Cache delete error: ${key}`, error);
		}
	}

	/**
	 * Clear all cache
	 */
	async clear(): Promise<void> {
		try {
			// Clear memory cache
			this.memoryCache.clear();

			// Clear storage cache
			const keys = this.context.workspaceState.keys();
			for (const key of keys) {
				if (key.startsWith(STORAGE_KEYS.CACHE_PREFIX)) {
					await this.context.workspaceState.update(key, undefined);
				}
			}

			logger.info('Cache cleared');
		} catch (error) {
			logger.error('Cache clear error', error);
		}
	}

	/**
	 * Check if cache entry is expired
	 */
	private isExpired<T>(entry: CacheEntry<T>): boolean {
		const now = Date.now();
		return now - entry.timestamp > entry.ttl;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): { memorySize: number; storageKeys: number } {
		const storageKeys = this.context.workspaceState.keys().filter((key) =>
			key.startsWith(STORAGE_KEYS.CACHE_PREFIX)
		).length;

		return {
			memorySize: this.memoryCache.size,
			storageKeys,
		};
	}
}
