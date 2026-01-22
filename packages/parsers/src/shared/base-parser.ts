/**
 * Base parser class providing common functionality for all route parsers
 * Handles ts-morph project initialization, logging, and detection patterns
 */

import * as fs from "fs";
import * as path from "path";
import { Project, SourceFile } from "ts-morph";

import { logger as defaultLogger, type Logger } from "../lib/logger";
import type { ParsedRoute, ParserOptions } from "../lib/types";

/**
 * Debug logger function type
 */
export type DebugLogger = (message: string) => void;

/**
 * Configuration for the base parser
 */
export interface BaseParserConfig {
	/** Name identifier for the parser (used in logging) */
	name: string;
	/** Debug prefix for log messages */
	debugPrefix: string;
	/** Dependencies to check for detection */
	dependencies: string[];
	/** File patterns to add to the project */
	filePatterns: string[];
	/** Whether tsconfig is required for parsing */
	requiresTsConfig?: boolean;
}

/**
 * Abstract base class for route parsers
 * Provides common functionality for AST-based route parsing
 */
export abstract class BaseParser {
	protected readonly config: BaseParserConfig;
	protected readonly rootDir: string;
	protected readonly options: ParserOptions;
	protected readonly logger: Logger;
	protected readonly debug: DebugLogger;

	protected project: Project | null = null;

	constructor(rootDir: string, config: BaseParserConfig, options?: ParserOptions) {
		this.rootDir = rootDir;
		this.config = config;
		this.options = options ?? {};
		this.logger = this.options.logger ?? defaultLogger;
		this.debug = this.createDebugLogger();
	}

	/**
	 * Detect if the framework is used in the project
	 */
	async detect(): Promise<boolean> {
		try {
			const hasFramework = await this.hasWorkspaceDependency(this.config.dependencies);
			if (hasFramework) {
				this.logger.info(`Detected ${this.config.name} project`);
			}
			return hasFramework;
		} catch (error) {
			this.logger.error(`Failed to detect ${this.config.name}`, error);
			return false;
		}
	}

	/**
	 * Parse routes from the project
	 */
	async parse(): Promise<ParsedRoute[]> {
		try {
			this.logger.debug(`Parsing ${this.config.name} routes with AST`);

			if (!this.rootDir) {
				this.logger.warn("No root directory provided");
				return [];
			}

			const tsconfigPath = await this.findTsConfig();

			if (this.config.requiresTsConfig && !tsconfigPath) {
				this.logger.warn("No tsconfig.json found, cannot parse routes without AST");
				return [];
			}

			this.project = this.initializeProject(tsconfigPath);

			if (tsconfigPath) {
				this.debug(`Using tsconfig at ${tsconfigPath}`);
			} else {
				this.debug("No tsconfig.json found, using default compiler options");
			}

			this.addSourceFiles();

			const routes = await this.parseRoutes();

			this.logger.info(`Parsed ${routes.length} ${this.config.name} routes using AST`);
			return routes;
		} catch (error) {
			this.logger.error(`Failed to parse ${this.config.name} routes with AST`, error);
			return [];
		}
	}

	/**
	 * Abstract method to implement route parsing logic
	 * Called after project initialization
	 */
	protected abstract parseRoutes(): Promise<ParsedRoute[]>;

	/**
	 * Initialize the ts-morph project
	 */
	protected initializeProject(tsconfigPath: string | null): Project {
		return tsconfigPath
			? new Project({
					tsConfigFilePath: tsconfigPath,
					skipAddingFilesFromTsConfig: false,
				})
			: new Project({ skipAddingFilesFromTsConfig: true });
	}

	/**
	 * Add source files to the project based on configured patterns
	 */
	protected addSourceFiles(): void {
		for (const pattern of this.config.filePatterns) {
			const fullPattern = path.join(this.rootDir, pattern);
			try {
				this.project!.addSourceFilesAtPaths(fullPattern);
				this.debug(`Added source files: ${fullPattern}`);
			} catch (error) {
				this.debug(`Failed to add source files for pattern ${pattern}: ${error}`);
			}
		}
	}

	/**
	 * Get source files filtered to the root directory
	 */
	protected getSourceFiles(): SourceFile[] {
		if (!this.project) {
			return [];
		}
		return this.project
			.getSourceFiles()
			.filter((file: SourceFile) => file.getFilePath().startsWith(this.rootDir));
	}

	/**
	 * Create a debug logger with the configured prefix
	 */
	protected createDebugLogger(): DebugLogger {
		return (message: string) => {
			this.logger.debug(`[${this.config.debugPrefix}] ${message}`);
		};
	}

	/**
	 * Check if package.json has any of the specified dependencies
	 */
	protected async hasWorkspaceDependency(dependencyNames: string[]): Promise<boolean> {
		const packageJsonPath = path.join(this.rootDir, "package.json");
		try {
			const content = await fs.promises.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(content);

			const deps = packageJson.dependencies ?? {};
			const devDeps = packageJson.devDependencies ?? {};

			return dependencyNames.some(
				(name) => deps[name] !== undefined || devDeps[name] !== undefined,
			);
		} catch {
			return false;
		}
	}

	/**
	 * Find tsconfig.json in the root directory
	 */
	protected async findTsConfig(): Promise<string | null> {
		const tsconfigPath = path.join(this.rootDir, "tsconfig.json");
		try {
			await fs.promises.access(tsconfigPath);
			return tsconfigPath;
		} catch {
			return null;
		}
	}

	/**
	 * Check if a file exists
	 */
	protected async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Read file contents
	 */
	protected async readFile(filePath: string): Promise<string | null> {
		try {
			return await fs.promises.readFile(filePath, "utf-8");
		} catch {
			return null;
		}
	}

	/**
	 * Get relative path from root directory
	 */
	protected relativePath(filePath: string): string {
		return path.relative(this.rootDir, filePath);
	}

	/**
	 * Join path with root directory
	 */
	protected joinPath(...parts: string[]): string {
		return path.join(this.rootDir, ...parts);
	}

	/**
	 * Get the ts-morph project instance
	 */
	protected getProject(): Project | null {
		return this.project;
	}
}
