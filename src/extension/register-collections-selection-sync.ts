import * as vscode from "vscode";
import { CollectionsProvider } from "../collections/collections.provider";
import { WATCHAPI_SCHEME } from "../providers/virtual-request-file-system";
import { RequestLinkStore } from "../storage/request-link-store";
import { extractEndpointIdFromHttpDocument } from "../utils/watchapi-request-metadata";

export function registerCollectionsSelectionSync(
  context: vscode.ExtensionContext,
  deps: {
    treeView: vscode.TreeView<vscode.TreeItem>;
    collectionsProvider: CollectionsProvider;
    requestLinks: RequestLinkStore;
  },
) {
  const { treeView, collectionsProvider, requestLinks } = deps;

  async function syncSelection(editor: vscode.TextEditor | undefined) {
    if (!editor) {
      return;
    }

    const endpointId = getEndpointId(editor.document);
    if (!endpointId) {
      return;
    }

    try {
      const match = await collectionsProvider.findEndpointItem(endpointId);
      if (!match) {
        return;
      }

      const alreadySelected =
        treeView.selection[0]?.id === match.endpoint.id &&
        treeView.selection[0] instanceof vscode.TreeItem;

      if (!alreadySelected) {
        await treeView.reveal(match.endpoint, {
          select: true,
          focus: false,
          expand: true,
        });
      }
    } catch (error) {
      console.error("Failed to sync WatchAPI selection", error);
    }
  }

  function getEndpointId(doc: vscode.TextDocument): string | undefined {
    const linked = requestLinks.getEndpointId(doc.uri);
    if (linked) {
      return linked;
    }

    const looksLikeHttp =
      doc.uri.scheme === WATCHAPI_SCHEME ||
      doc.languageId === "http" ||
      doc.uri.path.toLowerCase().endsWith(".http") ||
      doc.fileName.toLowerCase().endsWith(".http");
    if (!looksLikeHttp) {
      return undefined;
    }

    return extractEndpointIdFromHttpDocument(doc.getText()) ?? undefined;
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      void syncSelection(editor ?? undefined);
    }),
    collectionsProvider.onDidChangeTreeData(() => {
      void syncSelection(vscode.window.activeTextEditor ?? undefined);
    }),
  );

  void syncSelection(vscode.window.activeTextEditor ?? undefined);
}
