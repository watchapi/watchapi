import * as path from "path";
import * as vscode from "vscode";
import {
  detectTargets,
  getNextAppRoutes,
  getNextTrpcProcedures,
  type NextRouteNode,
  type TrpcProcedureNode,
} from "@watchapi/cli";
import { CollectionsProvider } from "../collections/collections.provider";
import { HttpMethod } from "../models/request";
import { CoreApiService } from "../services/core-api.service";

type SupportedTarget = "next-trpc" | "next-app-router";

type SyncApiDefinition = {
  id: string;
  name: string;
  method: string;
  sourceKey?: string;
  router?: string;
  procedure?: string;
  path?: string;
  visibility?: string;
  file?: string;
  line?: number;
  metadata?: Record<string, unknown>;
};

const SUPPORTED_TARGETS: SupportedTarget[] = ["next-trpc", "next-app-router"];
const CONTEXT_KEY = "watchapi.frameworkUploadAvailable";

export function registerFrameworkUploads(
  context: vscode.ExtensionContext,
  deps: { collectionsProvider: CollectionsProvider; coreApi: CoreApiService },
) {
  const { collectionsProvider, coreApi } = deps;
  const state: { detected: SupportedTarget[]; detecting?: Promise<void> } = {
    detected: [],
  };

  async function updateContext(available: boolean) {
    await vscode.commands.executeCommand("setContext", CONTEXT_KEY, available);
  }

  async function detectSupportedTargets(rootDir: string | undefined) {
    if (!rootDir) {
      state.detected = [];
      await updateContext(false);
      return;
    }

    state.detecting ??= (async () => {
      try {
        const detected = await detectTargets(rootDir);
        state.detected = detected
          .map((item) => item.target)
          .filter((target): target is SupportedTarget =>
            SUPPORTED_TARGETS.includes(target as SupportedTarget),
          );
      } catch (error) {
        console.warn("Failed to detect WatchAPI upload targets", error);
        state.detected = [];
      } finally {
        state.detecting = undefined;
        await updateContext(state.detected.length > 0);
      }
    })();

    await state.detecting;
  }

  async function pickTarget(): Promise<SupportedTarget | undefined> {
    if (state.detected.length === 1) {
      return state.detected[0];
    }

    const choice = await vscode.window.showQuickPick(
      state.detected.map((target) => ({
        label:
          target === "next-app-router"
            ? "Next.js App Router"
            : "Next.js tRPC router",
        description: target,
        target,
      })),
      { placeHolder: "Upload routes from which framework?" },
    );

    return choice?.target as SupportedTarget | undefined;
  }

  function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  function toRelative(filePath: string | undefined, rootDir: string) {
    if (!filePath) return undefined;
    const relative = path.relative(rootDir, filePath);
    return relative || filePath;
  }

  async function promptForRoutes(
    routes: NextRouteNode[],
    rootDir: string,
  ): Promise<NextRouteNode[] | undefined> {
    const selection = await vscode.window.showQuickPick(
      routes.map((route) => ({
        label: `${route.method} ${route.path}`,
        description: toRelative(route.file, rootDir),
        detail: route.returnsJson ? "Returns JSON" : undefined,
        picked: true,
        route,
      })),
      {
        canPickMany: true,
        placeHolder: "Select Next.js routes to upload",
        ignoreFocusOut: true,
      },
    );

    return selection?.map((item) => item.route);
  }

  async function promptForProcedures(
    procedures: TrpcProcedureNode[],
    rootDir: string,
  ): Promise<TrpcProcedureNode[] | undefined> {
    const selection = await vscode.window.showQuickPick(
      procedures.map((procedure) => ({
        label: `${procedure.router}.${procedure.procedure}`,
        description: toRelative(procedure.file, rootDir),
        detail: `${procedure.method.toUpperCase()} (${
          procedure.procedureType
        })`,
        picked: true,
        procedure,
      })),
      {
        canPickMany: true,
        placeHolder: "Select tRPC procedures to upload",
        ignoreFocusOut: true,
      },
    );

    return selection?.map((item) => item.procedure);
  }

  function getCollectionName(api: SyncApiDefinition, target: SupportedTarget) {
    const fromMetadata = (api.metadata as { collection?: unknown } | undefined)
      ?.collection;
    if (typeof fromMetadata === "string" && fromMetadata.trim()) {
      return fromMetadata.trim();
    }
    if (api.router?.trim()) {
      return api.router.trim();
    }
    return target === "next-app-router" ? "Next.js Routes" : "tRPC Procedures";
  }

  function normalizeUrl(api: SyncApiDefinition) {
    const raw = api.path || api.router || api.id;
    if (!raw) return "/";
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  async function uploadApis(
    target: SupportedTarget,
    apis: SyncApiDefinition[],
  ) {
    const grouped = new Map<string, SyncApiDefinition[]>();
    for (const api of apis) {
      const collectionName = getCollectionName(api, target);
      const existing = grouped.get(collectionName) ?? [];
      existing.push(api);
      grouped.set(collectionName, existing);
    }

    let collections = await coreApi.pullCollections();
    const collectionByName = new Map(
      collections.map((collection) => [collection.name, collection]),
    );
    const missing = [...grouped.keys()].filter(
      (name) => !collectionByName.has(name),
    );

    for (const name of missing) {
      await coreApi.createCollection(name);
    }

    if (missing.length) {
      collections = await coreApi.pullCollections();
      for (const collection of collections) {
        collectionByName.set(collection.name, collection);
      }
    }

    for (const [collectionName, collectionApis] of grouped.entries()) {
      const collection = collectionByName.get(collectionName);
      if (!collection) {
        console.warn("Collection missing after creation", collectionName);
        continue;
      }

      const existingKeys = new Set(
        collection.endpoints.map(
          (endpoint) => `${endpoint.method} ${endpoint.url}`,
        ),
      );

      for (const api of collectionApis) {
        const method = api.method as HttpMethod;
        const url = normalizeUrl(api);
        const key = `${method} ${url}`;
        if (existingKeys.has(key)) {
          continue;
        }

        await coreApi.createEndpoint({
          collectionId: collection.id,
          name: api.name,
          url,
          method,
        });
        existingKeys.add(key);
      }
    }
  }

  async function handleNextAppRouterUpload(rootDir: string) {
    const routes = await getNextAppRoutes({ rootDir });
    if (!routes.length) {
      void vscode.window.showInformationMessage(
        "No Next.js App Router routes found to upload.",
      );
      return;
    }

    const selected = await promptForRoutes(routes, rootDir);
    if (!selected?.length) {
      return;
    }

    const deriveCollection = (routePath: string) => {
      const clean = routePath.replace(/^\/+/, "");
      const second = clean.split("/")[1];
      return second || "root";
    };

    const apis: SyncApiDefinition[] = selected.map((route) => {
      const id = `${route.method} ${route.path}`;
      const collection = deriveCollection(route.path);
      return {
        id,
        name: id,
        sourceKey: `next-app-router:${id}`,
        method: route.method,
        router: collection,
        procedure: route.method,
        path: route.path,
        file: route.file,
        line: route.line,
        metadata: {
          collection,
          handler: route.handlerName,
          handlerLines: route.handlerLines,
          usesDb: route.usesDb,
          hasErrorHandling: route.hasErrorHandling,
          hasSideEffects: route.hasSideEffects,
          returnsJson: route.returnsJson,
          analyzed: route.analyzed,
        },
      };
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Uploading Next.js routes...",
      },
      async () => {
        await uploadApis("next-app-router", apis);
        await collectionsProvider.pullAndRefresh();
      },
    );
    void vscode.window.showInformationMessage(
      `Uploaded ${apis.length} Next.js route${
        apis.length === 1 ? "" : "s"
      } to WatchAPI.`,
    );
  }

  async function handleNextTrpcUpload(rootDir: string) {
    const procedures = await getNextTrpcProcedures({ rootDir });
    if (!procedures.length) {
      void vscode.window.showInformationMessage(
        "No Next.js tRPC procedures found to upload.",
      );
      return;
    }

    const selected = await promptForProcedures(procedures, rootDir);
    if (!selected?.length) {
      return;
    }

    const apis: SyncApiDefinition[] = selected.map((procedure) => {
      const operationId = `${procedure.router}.${procedure.procedure}`;
      return {
        id: operationId,
        name: operationId,
        sourceKey: `next-trpc:${operationId}`,
        method: procedure.method === "query" ? "GET" : "POST",
        router: procedure.router,
        procedure: procedure.procedure,
        path: operationId,
        file: procedure.file,
        line: procedure.line,
        visibility: procedure.procedureType,
        metadata: {
          collection: procedure.router,
          resolverLines: procedure.resolverLines,
          usesDb: procedure.usesDb,
          hasErrorHandling: procedure.hasErrorHandling,
          hasSideEffects: procedure.hasSideEffects,
        },
      };
    });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Uploading tRPC procedures to WatchAPI...",
      },
      async () => {
        await uploadApis("next-trpc", apis);
        await collectionsProvider.pullAndRefresh();
      },
    );
    void vscode.window.showInformationMessage(
      `Uploaded ${apis.length} tRPC procedure${
        apis.length === 1 ? "" : "s"
      } to WatchAPI.`,
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "watchapi.collections.uploadDetectedApis",
      async () => {
        const rootDir = getWorkspaceRoot();
        if (!rootDir) {
          void vscode.window.showErrorMessage(
            "Open a workspace folder to upload WatchAPI routes.",
          );
          return;
        }

        if (!state.detected.length) {
          await detectSupportedTargets(rootDir);
        }

        const target = await pickTarget();
        if (!target) {
          if (!state.detected.length) {
            void vscode.window.showInformationMessage(
              "No supported frameworks detected for WatchAPI uploads.",
            );
          }
          return;
        }

        try {
          if (target === "next-app-router") {
            await handleNextAppRouterUpload(rootDir);
          } else {
            await handleNextTrpcUpload(rootDir);
          }
        } catch (error) {
          console.error("Failed to upload APIs", error);
          void vscode.window.showErrorMessage(
            error instanceof Error ? error.message : "Failed to upload APIs",
          );
        }
      },
    ),
  );

  void detectSupportedTargets(getWorkspaceRoot());
}
