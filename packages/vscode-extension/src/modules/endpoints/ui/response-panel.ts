import * as vscode from "vscode";
import type { ApiEndpoint } from "../endpoints.types";
import { HttpResponse } from "@/shared/http-response";
import { getResponseDocumentProvider } from "./response-document-provider";
import { formatHeaders } from "@/shared/misc";

let currentEditor: vscode.TextEditor | undefined;

export async function showResponsePanel(
    endpoint: ApiEndpoint,
    response: HttpResponse,
): Promise<void> {
    const content = formatResponseDocument(endpoint, response);
    const responseProvider = getResponseDocumentProvider();
    const responseUri = responseProvider.getUri();
    let document = currentEditor?.document;

    responseProvider.update(content);

    if (
        !document ||
        document.isClosed ||
        document.uri.toString() !== responseUri.toString()
    ) {
        document = await vscode.workspace.openTextDocument(responseUri);
    }

    await vscode.languages.setTextDocumentLanguage(document, "http");

    currentEditor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Two,
        preserveFocus: true,
        preview: false,
    });
}

function formatResponseDocument(
    _: ApiEndpoint,
    response: HttpResponse,
): string {
    const timing = response.timingPhases?.total ?? 0;
    const sizeKb = response.bodySizeInBytes / 1024;

    const sizeLabel =
        sizeKb < 1024
            ? `${sizeKb.toFixed(2)} KB`
            : `${(sizeKb / 1024).toFixed(2)} MB`;

    const statusLine = `${response.statusCode} ${response.statusMessage} • ${timing} ms • ${sizeLabel}`;

    const headerLines = formatHeaders(response.headers).trim();

    const body = formatResponseBody(response);

    const headerSection = headerLines ? `${headerLines}\n\n` : "\n\n";

    return [statusLine, headerSection + (body ?? ""), ""].join("\n");
}

function formatResponseBody(response: HttpResponse): string {
    if (!response.body) return "";

    const contentType = response.contentType ?? "";
    if (contentType.includes("application/json")) {
        try {
            return JSON.stringify(JSON.parse(response.body), null, 2);
        } catch {
            return response.body;
        }
    }

    return response.body;
}
