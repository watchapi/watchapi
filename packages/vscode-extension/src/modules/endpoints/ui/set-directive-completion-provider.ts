/**
 * Completion provider for @set directive in .http files
 * Provides suggestions for response paths like response.cookies.*, response.headers.*, etc.
 */

import * as vscode from "vscode";

export class SetDirectiveCompletionProvider
    implements vscode.CompletionItemProvider
{
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        const lineText = document.lineAt(position).text;
        const linePrefix = lineText.substring(0, position.character);

        // Check if we're in a @set directive line
        if (!linePrefix.match(/^\s*@set\s+\w*\s*=?\s*/)) {
            // Also trigger when typing @ at the start
            if (linePrefix.match(/^\s*@s?e?t?$/)) {
                return [this.createSetDirectiveSnippet()];
            }
            return undefined;
        }

        // After the = sign, provide response path suggestions
        if (linePrefix.includes("=")) {
            const afterEquals = linePrefix.split("=")[1]?.trimStart() || "";
            return this.getResponsePathCompletions(afterEquals);
        }

        return undefined;
    }

    private createSetDirectiveSnippet(): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            "@set",
            vscode.CompletionItemKind.Snippet,
        );
        item.insertText = new vscode.SnippetString(
            "set ${1:varName} = ${2|response.body.,response.cookies.,response.headers.|}${3:path}",
        );
        item.documentation = new vscode.MarkdownString(
            "Extract a value from the HTTP response and save it to environment variables.\n\n" +
                "**Examples:**\n" +
                "- `@set authToken = response.data.token`\n" +
                "- `@set sessionId = response.cookies.session_id`\n" +
                "- `@set contentType = response.headers.content-type`",
        );
        item.detail = "Set variable from response";
        return item;
    }

    private getResponsePathCompletions(
        currentText: string,
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // Top-level response paths
        if (!currentText || currentText === "r" || currentText === "re") {
            items.push(
                this.createPathCompletion(
                    "response.body.",
                    "Extract from JSON response body",
                    "response.body.${1:path}",
                ),
                this.createPathCompletion(
                    "response.cookies.",
                    "Extract a specific cookie value",
                    "response.cookies.${1:cookie_name}",
                ),
                this.createPathCompletion(
                    "response.headers.",
                    "Extract a response header value",
                    "response.headers.${1:header_name}",
                ),
            );
        }

        // After response.
        if (currentText.match(/^response\.?$/)) {
            items.push(
                this.createPathCompletion(
                    "body.",
                    "JSON response body",
                    "body.${1:path}",
                ),
                this.createPathCompletion(
                    "cookies.",
                    "Response cookies (from set-cookie headers)",
                    "cookies.${1:cookie_name}",
                ),
                this.createPathCompletion(
                    "headers.",
                    "Response headers",
                    "headers.${1:header_name}",
                ),
            );
        }

        // After response.cookies.
        if (currentText.match(/^response\.cookies\.?$/)) {
            items.push(
                this.createSimpleCompletion("session_id", "Session ID cookie"),
                this.createSimpleCompletion(
                    "access_token",
                    "Access token cookie",
                ),
                this.createSimpleCompletion(
                    "refresh_token",
                    "Refresh token cookie",
                ),
            );
        }

        // After response.headers.
        if (currentText.match(/^response\.headers\.?$/)) {
            items.push(
                this.createSimpleCompletion(
                    "authorization",
                    "Authorization header",
                ),
                this.createSimpleCompletion(
                    "content-type",
                    "Content-Type header",
                ),
                this.createSimpleCompletion(
                    "location",
                    "Location header (redirects)",
                ),
                this.createSimpleCompletion(
                    "x-request-id",
                    "Request ID header",
                ),
                this.createSimpleCompletion("etag", "ETag header"),
            );
        }

        // Common body paths
        if (
            currentText.match(/^response\.body\.?$/) ||
            currentText.match(/^response\.$/) ||
            !currentText
        ) {
            items.push(
                this.createSimpleCompletion(
                    "data.token",
                    "Token from data object",
                ),
                this.createSimpleCompletion("data.id", "ID from data object"),
                this.createSimpleCompletion("token", "Token from root"),
                this.createSimpleCompletion("id", "ID from root"),
                this.createSimpleCompletion("accessToken", "Access token"),
                this.createSimpleCompletion("user.id", "User ID"),
            );
        }

        return items;
    }

    private createPathCompletion(
        label: string,
        detail: string,
        snippet: string,
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            label,
            vscode.CompletionItemKind.Property,
        );
        item.insertText = new vscode.SnippetString(snippet);
        item.detail = detail;
        return item;
    }

    private createSimpleCompletion(
        label: string,
        detail: string,
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(
            label,
            vscode.CompletionItemKind.Field,
        );
        item.detail = detail;
        return item;
    }
}

export function registerSetDirectiveCompletionProvider(
    context: vscode.ExtensionContext,
): void {
    const provider = new SetDirectiveCompletionProvider();

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: "http", scheme: "*" },
            provider,
            "@",
            ".",
            "=",
        ),
    );
}
