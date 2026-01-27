import * as vscode from "vscode";

export const RESPONSE_DOCUMENT_SCHEME = "watchapi-response";

export class ResponseDocumentProvider
    implements vscode.TextDocumentContentProvider
{
    private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
    private content = "";

    readonly onDidChange = this.emitter.event;

    provideTextDocumentContent(): string {
        return this.content;
    }

    /**
     * Update document content
     */
    update(content: string): void {
        this.content = content;
        this.emitter.fire(this.getUri());
    }

    /**
     * Generate URI for the response document
     */
    getUri(): vscode.Uri {
        return vscode.Uri.parse(`${RESPONSE_DOCUMENT_SCHEME}:Response.http`);
    }
}

let responseProvider: ResponseDocumentProvider | undefined;

export function getResponseDocumentProvider(): ResponseDocumentProvider {
    if (!responseProvider) {
        responseProvider = new ResponseDocumentProvider();
    }
    return responseProvider;
}
