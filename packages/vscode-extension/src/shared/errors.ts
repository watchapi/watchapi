/**
 * Custom error classes for WatchAPI extension
 * Follows the same pattern as backend for consistency
 */

export class WatchAPIError extends Error {
    constructor(
        message: string,
        public code: string = "UNKNOWN_ERROR",
        public statusCode: number = 500
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AuthenticationError extends WatchAPIError {
    constructor(message: string = "Authentication failed") {
        super(message, "AUTHENTICATION_ERROR", 401);
    }
}

export class AuthorizationError extends WatchAPIError {
    constructor(message: string = "Insufficient permissions") {
        super(message, "AUTHORIZATION_ERROR", 403);
    }
}

export class NotFoundError extends WatchAPIError {
    constructor(resource: string, identifier?: string) {
        const message = identifier
            ? `${resource} with identifier '${identifier}' not found`
            : `${resource} not found`;
        super(message, "NOT_FOUND", 404);
    }
}

export class ValidationError extends WatchAPIError {
    constructor(message: string) {
        super(message, "VALIDATION_ERROR", 400);
    }
}

export class NetworkError extends WatchAPIError {
    constructor(message: string = "Network request failed") {
        super(message, "NETWORK_ERROR", 500);
    }
}

export class SyncError extends WatchAPIError {
    constructor(message: string) {
        super(message, "SYNC_ERROR", 500);
    }
}
