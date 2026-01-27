/**
 * Shared TypeScript types
 * Re-exports domain-specific types for backwards compatibility
 */

// Organization types
export type {
    Organization,
    UserOrganization,
} from "@/modules/organizations/organization.types";

// Collection types
export type {
    Collection,
    CreateCollectionInput,
    UpdateCollectionInput,
} from "@/modules/collections/collections.types";

// Endpoint types
export type {
    SetDirective,
    ApiEndpoint,
    CreateApiEndpointInput,
    UpdateApiEndpointInput,
} from "@/modules/endpoints/endpoints.types";

// Environment types
export type {
    EnvironmentVariable,
    Environment,
} from "@/modules/environments/environments.types";

// Sync types
export type {
    ParsedRoute,
    CacheEntry,
    SyncState,
} from "@/modules/sync/sync.types";
