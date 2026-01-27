/**
 * Sync service
 * Handles synchronization between local cache and cloud
 */

import * as vscode from 'vscode';
import { CollectionsService } from '@/modules/collections/collections.service';
import { EndpointsService } from '@/modules/endpoints/endpoints.service';
import { CacheService } from './cache.service';
import { logger } from '@/shared/logger';
import { SyncError } from '@/shared/errors';
import { STORAGE_KEYS, SYNC_CONFIG } from '@/shared/constants';
import type { Collection } from '@/modules/collections/collections.types';
import type { ApiEndpoint } from '@/modules/endpoints/endpoints.types';
import type { SyncState } from './sync.types';
import type { LocalStorageService } from '@/infrastructure/storage/local-storage.service';

export class SyncService {
	private context: vscode.ExtensionContext;
	private collectionsService: CollectionsService;
	private endpointsService: EndpointsService;
	private cacheService: CacheService;
	private localStorage?: LocalStorageService;

	private _onDidChangeState = new vscode.EventEmitter<SyncState>();
	public readonly onDidChangeState = this._onDidChangeState.event;

	private syncState: SyncState = { isSyncing: false };
	private autoSyncInterval?: NodeJS.Timeout;
	private isInitialized = false;

	constructor(
		context: vscode.ExtensionContext,
		collectionsService: CollectionsService,
		endpointsService: EndpointsService,
		cacheService: CacheService
	) {
		this.context = context;
		this.collectionsService = collectionsService;
		this.endpointsService = endpointsService;
		this.cacheService = cacheService;
	}

	/**
	 * Set local storage reference for migration
	 */
	setLocalStorage(localStorage: LocalStorageService): void {
		this.localStorage = localStorage;
	}

	/**
	 * Initialize sync service
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		logger.info('Initializing sync service');

		// Check if we have local data to migrate
		if (this.localStorage) {
			await this.migrateLocalDataToCloud();
		}

		// Perform initial sync
		await this.sync();

		// Set up auto-sync interval
		this.startAutoSync();
		this.isInitialized = true;
	}

	/**
	 * Migrate local data to cloud on first login
	 */
	private async migrateLocalDataToCloud(): Promise<void> {
		try {
			const [localCollections, localEndpoints] = await Promise.all([
				this.localStorage!.getCollections(),
				this.localStorage!.getEndpoints(),
			]);

			if (localCollections.length === 0 && localEndpoints.length === 0) {
				logger.info('No local data to migrate');
				return;
			}

			logger.info(
				`Migrating ${localCollections.length} collections and ${localEndpoints.length} endpoints to cloud`
			);

			// Upload collections first (endpoints reference collections)
			const collectionIdMap = new Map<string, string>();
			for (const localCollection of localCollections) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { id, createdAt, updatedAt, ...input } = localCollection;
				const cloudCollection = await this.collectionsService.create(input);
				collectionIdMap.set(id, cloudCollection.id);
				logger.info(`Migrated collection: ${cloudCollection.name}`);
			}

			// Upload endpoints with updated collection IDs
			for (const localEndpoint of localEndpoints) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { id, createdAt, updatedAt, collectionId, ...input } = localEndpoint;
				const cloudCollectionId = collectionId
					? collectionIdMap.get(collectionId)
					: undefined;

				await this.endpointsService.create({
					...input,
					collectionId: cloudCollectionId,
				});
				logger.info(`Migrated endpoint: ${input.name}`);
			}

			// Clear local storage after successful migration
			await this.localStorage!.clearAll();
			logger.info('Local data migration completed successfully');
		} catch (error) {
			logger.error('Failed to migrate local data to cloud', error);
			// Don't throw - allow sync to continue
		}
	}

	/**
	 * Start auto-sync at configured interval
	 */
	startAutoSync(): void {
		if (this.autoSyncInterval) {
			return;
		}

		logger.info(`Starting auto-sync (interval: ${SYNC_CONFIG.AUTO_SYNC_INTERVAL}ms)`);

		this.autoSyncInterval = setInterval(() => {
			this.sync().catch((error) => {
				logger.error('Auto-sync failed', error);
			});
		}, SYNC_CONFIG.AUTO_SYNC_INTERVAL);
	}

	/**
	 * Stop auto-sync
	 */
	stopAutoSync(): void {
		if (this.autoSyncInterval) {
			clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = undefined;
			logger.info('Stopped auto-sync');
		}
	}

	/**
	 * Sync collections and endpoints from cloud
	 */
	async sync(): Promise<void> {
		if (this.syncState.isSyncing) {
			logger.debug('Sync already in progress, skipping');
			return;
		}

		try {
			this.updateState({ isSyncing: true });
			logger.info('Starting sync');

			// Fetch data from cloud
			const [collections, endpoints] = await Promise.all([
				this.fetchCollections(),
				this.fetchEndpoints(),
			]);

			// Cache the data
			await Promise.all([
				this.cacheService.set('collections', collections),
				this.cacheService.set('endpoints', endpoints),
			]);

			// Update last sync time
			await this.context.workspaceState.update(STORAGE_KEYS.LAST_SYNC, Date.now());

			this.updateState({ isSyncing: false, lastSyncTime: Date.now() });
			logger.info('Sync completed successfully');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			this.updateState({ isSyncing: false, error: errorMessage });
			logger.error('Sync failed', error);
			throw new SyncError(`Sync failed: ${errorMessage}`);
		}
	}

	/**
	 * Get collections (from cache or cloud)
	 */
	async getCollections(): Promise<Collection[]> {
		// Try cache first
		const cached = await this.cacheService.get<Collection[]>('collections');
		if (cached) {
			logger.debug('Returning collections from cache');
			return cached;
		}

		// Fetch from cloud and cache
		logger.debug('Fetching collections from cloud');
		const collections = await this.fetchCollections();
		await this.cacheService.set('collections', collections);

		return collections;
	}

	/**
	 * Get endpoints (from cache or cloud)
	 */
	async getEndpoints(): Promise<ApiEndpoint[]> {
		// Try cache first
		const cached = await this.cacheService.get<ApiEndpoint[]>('endpoints');
		if (cached) {
			logger.debug('Returning endpoints from cache');
			return cached;
		}

		// Fetch from cloud and cache
		logger.debug('Fetching endpoints from cloud');
		const endpoints = await this.fetchEndpoints();
		await this.cacheService.set('endpoints', endpoints);

		return endpoints;
	}

	/**
	 * Get last sync time
	 */
	async getLastSyncTime(): Promise<number | undefined> {
		return this.context.workspaceState.get<number>(STORAGE_KEYS.LAST_SYNC);
	}

	/**
	 * Get current sync state
	 */
	getSyncState(): SyncState {
		return this.syncState;
	}

	/**
	 * Fetch collections from cloud with retry
	 */
	private async fetchCollections(): Promise<Collection[]> {
		return this.retryOperation(() => this.collectionsService.getAll());
	}

	/**
	 * Fetch endpoints from cloud with retry
	 */
	private async fetchEndpoints(): Promise<ApiEndpoint[]> {
		return this.retryOperation(() => this.endpointsService.getAll());
	}

	/**
	 * Retry operation with exponential backoff
	 */
	private async retryOperation<T>(
		operation: () => Promise<T>,
		attempts: number = SYNC_CONFIG.RETRY_ATTEMPTS
	): Promise<T> {
		let lastError: Error | undefined;

		for (let i = 0; i < attempts; i++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				logger.warn(`Operation failed (attempt ${i + 1}/${attempts})`, error);

				if (i < attempts - 1) {
					const delay = SYNC_CONFIG.RETRY_DELAY * Math.pow(2, i);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		throw lastError || new Error('Operation failed after retries');
	}

	/**
	 * Update sync state and notify listeners
	 */
	private updateState(update: Partial<SyncState>): void {
		this.syncState = { ...this.syncState, ...update };
		this._onDidChangeState.fire(this.syncState);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stopAutoSync();
		this._onDidChangeState.dispose();
	}
}
