import * as vscode from "vscode";
import { parseHttpFile } from "@/parsers";

export class HttpFileCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
        new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> =
        this._onDidChangeCodeLenses.event;

    provideCodeLenses(
        document: vscode.TextDocument,
        // token: vscode.CancellationToken,
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        // Only activate for .http/.rest files (even if language is plaintext)
        if (!this.isHttpLikeDocument(document)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split("\n");

        // Find all request lines (GET, POST, etc.)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i)) {
                const range = new vscode.Range(i, 0, i, 0);

                // Parse the current request block
                const requestBlock = this.extractRequestBlock(lines, i);
                const endpoint = parseHttpFile(requestBlock);

                // Add CodeLens alongside other request actions
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: "▶ Run Request",
                        command: "watchapi.executeFromEditor",
                        arguments: [endpoint, document.uri],
                        tooltip: `Execute ${endpoint.method} ${endpoint.requestPath}`,
                    }),
                );
            }
        }

        return codeLenses;
    }

    /**
     * Extract the full request block starting from the request line
     */
    private extractRequestBlock(lines: string[], startIndex: number): string {
        const block: string[] = [];

        // Go backwards to capture comments and @ variables
        let i = startIndex;
        while (i >= 0) {
            const line = lines[i].trim();
            if (
                line === "" ||
                line.startsWith("#") ||
                line.startsWith("//") ||
                line.startsWith("@")
            ) {
                block.unshift(lines[i]);
                i--;
            } else if (i === startIndex) {
                // This is the request line itself
                block.push(lines[i]);
                break;
            } else {
                break;
            }
        }

        // Go forward to capture headers and body
        i = startIndex + 1;
        let inBody = false;
        while (i < lines.length) {
            const line = lines[i].trim();

            // Stop at next request (### or new HTTP method)
            if (
                line.startsWith("###") ||
                line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i)
            ) {
                break;
            }

            // Empty line after headers = body starts
            if (line === "" && !inBody) {
                inBody = true;
            }

            block.push(lines[i]);

            // If we're in the body and hit another empty line, might be end
            if (inBody && line === "" && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (
                    nextLine.startsWith("###") ||
                    nextLine.match(
                        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i,
                    )
                ) {
                    break;
                }
            }

            i++;
        }

        return block.join("\n");
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    private isHttpLikeDocument(document: vscode.TextDocument): boolean {
        if (
            document.languageId === "http" ||
            document.languageId === "rest" ||
            document.uri.scheme === "watchapi"
        ) {
            return true;
        }

        const filename = document.fileName.toLowerCase();
        return filename.endsWith(".http") || filename.endsWith(".rest");
    }
}
