/**
 * Environment-related types
 */

export interface EnvironmentVariable {
    key: string;
    value: string;
    description?: string;
    enabled: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: EnvironmentVariable[];
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}
