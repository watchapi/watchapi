/**
 * Simple logger utility for parsers
 * Can be enhanced to use different logging backends
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

class Logger {
	private logLevel: LogLevel = LogLevel.INFO;

	setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	debug(message: string, data?: unknown): void {
		this.log(LogLevel.DEBUG, message, data);
	}

	info(message: string, data?: unknown): void {
		this.log(LogLevel.INFO, message, data);
	}

	warn(message: string, data?: unknown): void {
		this.log(LogLevel.WARN, message, data);
	}

	error(message: string, error?: unknown): void {
		this.log(LogLevel.ERROR, message, error);
	}

	private log(level: LogLevel, message: string, data?: unknown): void {
		if (level < this.logLevel) {
			return;
		}

		const timestamp = new Date().toISOString();
		const levelStr = LogLevel[level];
		let logMessage = `[${timestamp}] [${levelStr}] ${message}`;

		if (data !== undefined) {
			if (data instanceof Error) {
				logMessage += `\n${data.stack || data.message}`;
			} else {
				try {
					logMessage += `\n${JSON.stringify(data, null, 2)}`;
				} catch {
					logMessage += `\n${String(data)}`;
				}
			}
		}

		// Use console for logging
		const consoleFn =
			level === LogLevel.ERROR
				? console.error
				: level === LogLevel.WARN
					? console.warn
					: level === LogLevel.DEBUG
						? console.debug
						: console.log;

		consoleFn(logMessage);
	}
}

// Export singleton instance
export const logger = new Logger();
