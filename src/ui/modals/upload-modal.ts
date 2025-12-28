/**
 * Upload modal
 * Shows detected routes and allows user to select which to upload
 */

import * as vscode from "vscode";
import { CollectionsService } from "@/collections/collections.service";
import { EndpointsService } from "@/endpoints/endpoints.service";
import { logger } from "@/shared/logger";
import type {
  ParsedRoute,
  Collection,
  CreateApiEndpointInput,
} from "@/shared/types";
import { humanizeRouteName } from "@/endpoints/endpoints.editor";

export class UploadModal {
  private collectionsService: CollectionsService;
  private endpointsService: EndpointsService;

  constructor(
    collectionsService: CollectionsService,
    endpointsService: EndpointsService,
  ) {
    this.collectionsService = collectionsService;
    this.endpointsService = endpointsService;
  }

  /**
   * Show upload modal with detected routes
   */
  async show(routes: ParsedRoute[]): Promise<void> {
    try {
      if (routes.length === 0) {
        vscode.window.showInformationMessage(
          "No API routes detected in this project",
        );
        return;
      }

      const routesWithNames = routes.map((r) => ({
        ...r,
        name: humanizeRouteName(r),
      }));

      logger.info(`Showing upload modal with ${routesWithNames.length} routes`);

      // Step 1: Select routes to upload
      const selectedRoutes = await this.selectRoutes(routesWithNames);
      if (!selectedRoutes || selectedRoutes.length === 0) {
        logger.info("Upload cancelled: no routes selected");
        return;
      }

      const routesWithDomain = this.applyDomainPrefix(selectedRoutes);

      // Step 2: Group collections
      const groups = this.groupRoutesByPrefix(routesWithDomain);

      // Step 3: Upload collections
      await this.uploadGroupedEndpoints(groups);

      vscode.window.showInformationMessage(
        `Successfully uploaded ${selectedRoutes.length} endpoint(s)`,
      );

      logger.info(`Uploaded ${selectedRoutes.length} endpoints`);
    } catch (error) {
      logger.error("Upload failed", error);
      vscode.window.showErrorMessage(`Upload failed: ${error}`);
    }
  }

  private applyDomainPrefix(routes: ParsedRoute[]): ParsedRoute[] {
    return routes.map((route) => ({
      ...route,
      path: `{{domain}}${route.path}`,
    }));
  }

  /**
   * Show route selection quick pick
   */
  private async selectRoutes(
    routes: ParsedRoute[],
  ): Promise<ParsedRoute[] | undefined> {
    interface RouteQuickPickItem extends vscode.QuickPickItem {
      route: ParsedRoute;
    }

    const items: RouteQuickPickItem[] = routes.map((route) => ({
      label: `$(symbol-method) ${route.name}`,
      description: route.method,
      detail: route.filePath,
      route,
      picked: true, // Select all by default
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: "Select endpoints to upload",
      placeHolder: "Choose which endpoints to upload to WatchAPI",
      canPickMany: true,
    });

    return selected?.map((item) => item.route);
  }

  private async uploadGroupedEndpoints(
    groups: Map<string, ParsedRoute[]>,
  ): Promise<void> {
    const existingCollections = await this.collectionsService.getAll();

    // total endpoints count (for progress)
    const total = Array.from(groups.values()).reduce(
      (sum, routes) => sum + routes.length,
      0,
    );

    let processed = 0;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Uploading endpoints to WatchAPI",
        cancellable: false,
      },
      async (progress) => {
        for (const [groupName, routes] of groups) {
          let collection =
            existingCollections.find((c) => c.name === groupName) ??
            (await this.collectionsService.create({
              name: groupName,
              description: `Auto-generated from ${groupName} routes`,
            }));

          for (const route of routes) {
            await this.endpointsService.create({
              name: route.name,
              url: route.path,
              method: route.method,
              collectionId: collection.id,
              isActive: false,
            });

            processed++;

            progress.report({
              message: `${processed}/${total} ${route.method} ${route.path}`,
              increment: (1 / total) * 100,
            });
          }
        }
      },
    );
  }

  /**
   * Group routes by prefix for suggested collection names
   */
  private groupRoutesByPrefix(
    routes: ParsedRoute[],
  ): Map<string, ParsedRoute[]> {
    const groups = new Map<string, ParsedRoute[]>();

    for (const route of routes) {
      const prefix = this.extractRoutePrefix(route.path);
      const existing = groups.get(prefix) || [];
      existing.push(route);
      groups.set(prefix, existing);
    }

    return groups;
  }

  /**
   * Extract route prefix (e.g., /api/users -> users)
   */
  private extractRoutePrefix(path: string): string {
    const normalizedPath = path.replace("{{domain}}", "");

    if (normalizedPath.startsWith("/api/trpc/")) {
      const trpcPath = normalizedPath.slice("/api/trpc/".length);

      const [router] = trpcPath.split(".");

      return router || "default";
    }

    const parts = normalizedPath.split("/").filter(Boolean);

    if (parts.length >= 2 && parts[0] === "api") {
      return parts[1];
    }

    return parts[0] || "default";
  }
}
