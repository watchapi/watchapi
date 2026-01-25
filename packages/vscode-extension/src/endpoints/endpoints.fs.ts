import * as vscode from "vscode";
import { EndpointsService } from "@/endpoints/endpoints.service";
import { constructHttpFile, parseHttpFile } from "@/parsers";
import { readRestClientEnvFile } from "@/environments";
import { getEndpointIdFromUri } from "./endpoints.editor";

export class EndpointsFileSystemProvider implements vscode.FileSystemProvider {
    private readonly emitter = new vscode.EventEmitter<
        vscode.FileChangeEvent[]
    >();
    readonly onDidChangeFile = this.emitter.event;

    constructor(private endpointsService: EndpointsService) {}

    // ---- required but mostly unused ----
    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(): vscode.FileStat {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0,
        };
    }

    readDirectory(): [string, vscode.FileType][] {
        return [];
    }

    createDirectory(): void {}

    delete(): void {}

    rename(): void {}

    // ---- IMPORTANT PARTS ----

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const endpointId = this.getEndpointId(uri);
        const endpoint = await this.endpointsService.getById(endpointId);

        const env = await readRestClientEnvFile();

        // Read setting for Authorization header
        const config = vscode.workspace.getConfiguration("watchapi");
        const includeAuthorizationHeader = config.get<boolean>(
            "includeAuthorizationHeader",
            true,
        );

        const content = constructHttpFile(endpoint, env, {
            includeAuthorizationHeader,
        });

        return Buffer.from(content, "utf8");
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const endpointId = this.getEndpointId(uri);
        const text = Buffer.from(content).toString("utf8");

        try {
            const parsed = parseHttpFile(text);

            await this.endpointsService.update(endpointId, {
                name: parsed.name,
                pathTemplate: parsed.pathTemplate,
                requestPath: parsed.requestPath,
                method: parsed.method,
                headersOverrides: parsed.headersOverrides,
                queryOverrides: parsed.queryOverrides,
                bodyOverrides: parsed.bodyOverrides,
                setDirectivesOverrides: parsed.setDirectivesOverrides,
            });

            this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
        } catch (error) {
            throw new vscode.FileSystemError(
                `Failed to save endpoint: ${String(error)}`,
            );
        }
    }

    private getEndpointId(uri: vscode.Uri): string {
        // New format: endpoint ID is in query string ?id={uuid}
        const id = getEndpointIdFromUri(uri);

        if (id) {
            return id;
        }

        throw new vscode.FileSystemError(
            `Invalid WatchAPI endpoint URI: ${uri.path}`,
        );
    }
}
