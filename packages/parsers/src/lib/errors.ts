/**
 * Custom error classes for parsers
 */

export class WatchAPIError extends Error {
	constructor(
		message: string,
		public code: string = 'UNKNOWN_ERROR',
		public statusCode: number = 500
	) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class ParserError extends WatchAPIError {
	constructor(message: string) {
		super(message, 'PARSER_ERROR', 400);
	}
}

export class ValidationError extends WatchAPIError {
	constructor(message: string) {
		super(message, 'VALIDATION_ERROR', 400);
	}
}
