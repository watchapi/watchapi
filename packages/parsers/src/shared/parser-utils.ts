/**
 * Shared parser utilities
 */

import * as vscode from "vscode";
import * as path from "path";

import { logger } from "../lib/logger";

export async function hasWorkspaceDependency(
  dependencyNames: string[],
): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return false;
  }

  for (const folder of workspaceFolders) {
    const packageJsonUri = vscode.Uri.joinPath(folder.uri, "package.json");
    try {
      const content = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(content.toString());

      const deps = packageJson.dependencies ?? {};
      const devDeps = packageJson.devDependencies ?? {};

      if (
        dependencyNames.some(
          (name) => deps[name] !== undefined || devDeps[name] !== undefined,
        )
      ) {
        return true;
      }
    } catch {
      // Continue to next workspace folder
    }
  }

  return false;
}

export async function findTsConfig(rootDir: string): Promise<string | null> {
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  try {
    const uri = vscode.Uri.file(tsconfigPath);
    await vscode.workspace.fs.stat(uri);
    return tsconfigPath;
  } catch {
    return null;
  }
}

export function createDebugLogger(
  prefix: string,
  verbose?: boolean,
): (message: string) => void {
  return (message: string) => {
    if (!verbose) {
      return;
    }
    logger.debug(`[${prefix}] ${message}`);
  };
}
