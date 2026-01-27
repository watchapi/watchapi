/**
 * Organization-related types
 */

export interface Organization {
    id: string;
    name: string;
    slug: string;
    description?: string;
    plan: "FREE" | "PRO" | "ENTERPRISE";
    role?: "OWNER" | "ADMIN" | "MEMBER";
    status?: "ACTIVE" | "PENDING";
    joinedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface UserOrganization extends Organization {
    role: "OWNER" | "ADMIN" | "MEMBER";
    status: "ACTIVE" | "PENDING";
    joinedAt: string;
}
