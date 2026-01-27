/**
 * Collection-related types
 */

export interface Collection {
    id: string;
    name: string;
    description?: string;
    organizationId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCollectionInput {
    name: string;
    description?: string;
}

export interface UpdateCollectionInput {
    name?: string;
    description?: string;
}
