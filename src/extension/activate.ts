import * as vscode from "vscode";
import { CollectionsProvider } from "../collections/collections.provider";
import { ensureGuestLogin } from "../auth/auth.service";
import { CoreApiService } from "../services/core-api.service";
import { RequestLinkStore } from "../storage/request-link-store";
import {
  VirtualRequestFileSystemProvider,
  WATCHAPI_SCHEME,
} from "../providers/virtual-request-file-system";
import { registerAuthCommands } from "./register-auth-commands";
import { registerCollectionsCommands } from "./register-collections-commands";
import { registerCollectionsSelectionSync } from "./register-collections-selection-sync";
import { registerCollectionsTreeView } from "./register-collections-tree-view";
import { registerFrameworkUploads } from "./register-framework-uploads";
import { registerHttpClientReminder } from "./register-http-client-reminder";
import { registerHttpSyncOnSave } from "./register-http-sync-on-save";
import { registerSettingsCommands } from "./register-settings-commands";

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "watchapi-client" is now active!',
  );

  const coreApi = new CoreApiService(context);
  const collectionsProvider = new CollectionsProvider(coreApi);
  const requestLinks = new RequestLinkStore(context);
  const virtualFs = new VirtualRequestFileSystemProvider(coreApi, requestLinks);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(WATCHAPI_SCHEME, virtualFs, {
      isCaseSensitive: true,
    }),
  );

  registerHttpClientReminder(context);
  const treeView = registerCollectionsTreeView(context, collectionsProvider);
  registerCollectionsSelectionSync(context, {
    collectionsProvider,
    requestLinks,
    treeView,
  });
  registerCollectionsCommands(context, {
    collectionsProvider,
    collectionsService: coreApi,
    treeView,
    virtualFs,
  });
  registerHttpSyncOnSave(context, { coreApi, requestLinks });
  registerSettingsCommands(context);
  registerAuthCommands(context);
  registerFrameworkUploads(context, { collectionsProvider, coreApi });

  void ensureGuestLogin(context).catch((error: any) => {
    console.error("Guest login failed:", error);
  });
}
