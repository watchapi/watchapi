/**
 * Shared parser utilities
 * Environment agnostic - works in CLI, VSCode, or any Node.js context
 */

import * as path from "path";
import * as fs from "fs";

/**
 * Check if a dependency exists in the project's package.json
 */
export function hasWorkspaceDependency(
  rootDir: string,
  dependencyNames: string[],
): boolean {
  try {
    const packageJsonPath = path.join(rootDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    const content = fs.readFileSync(packageJsonPath, "utf-8");
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
 * Find tsconfig.json in directory
 */
export function findTsConfig(rootDir: string): string | null {
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    return tsconfigPath;
  }
  return null;
}

/**
 * Create debug logger
 */
export function createDebugLogger(
  prefix: string,
  verbose?: boolean,
): (message: string) => void {
  return (message: string) => {
    if (!verbose) {
      return;
    }
    console.log(`[${prefix}] ${message}`);
  };
}
