import * as vscode from "vscode";
import { ApiClient, type ApiClientOptions } from "../core";

const CONFIG_NAMESPACE = "watchapi";

type ConfigOptions = Omit<ApiClientOptions, "installId">;

export function getApiClientOptionsFromConfig(): ConfigOptions | null {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const apiUrl = config.get<string>("apiUrl")?.trim();
  if (!apiUrl) {
    return null;
  }

  const apiToken = config.get<string>("apiToken")?.trim() || undefined;
  const organizationId =
    config.get<string>("organizationId")?.trim() || undefined;

  return { apiUrl, apiToken, organizationId };
}

export function createApiClientFromConfig(options: {
  installId: string;
  apiToken?: string;
}): ApiClient {
  const configOptions = getApiClientOptionsFromConfig();
  if (!configOptions) {
    throw new Error(
      'Missing WatchAPI settings: set "watchapi.apiUrl" in VS Code settings.',
    );
  }

  return new ApiClient({
    ...configOptions,
    installId: options.installId,
    apiToken: options.apiToken ?? configOptions.apiToken,
  });
}
