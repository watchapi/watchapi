import * as vscode from "vscode";
import * as crypto from "crypto";
import {
    readRestClientEnvFile,
    resolveEnvironmentFromEnvFile,
} from "@/environments";

const FILE_VARIABLE_REGEX = /^\s*@([^\s=]+)\s*=\s*(.*?)\s*$/;

const SYSTEM_VARIABLE_INFO: Record<string, { example: string; description: string }> = {
    $timestamp: {
        example: "Unix timestamp",
        description: "Current time as seconds since epoch",
    },
    $guid: {
        example: "UUID v4",
        description: "Random unique identifier",
    },
    $randomInt: {
        example: "Random number",
        description: "Random integer between min and max",
    },
    $processEnv: {
        example: "Environment value",
        description: "Value from process.env",
    },
};

export class HttpVariableHoverProvider implements vscode.HoverProvider {
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Hover | undefined> {
        const range = this.getVariableRange(document, position);
        if (!range) return undefined;

        const fullMatch = document.getText(range);
        const variableName = fullMatch.replace(/^\{\{|\}\}$/g, "").trim();

        // System variable
        if (variableName.startsWith("$")) {
            return this.createSystemVariableHover(variableName, range);
        }

        // File variable
        const fileValue = this.findFileVariable(variableName, document);
        if (fileValue !== undefined) {
            return this.createHover(fileValue, "File Variable", range);
        }

        // Environment variable
        const envValue = await this.findEnvironmentVariable(variableName, document);
        if (envValue !== undefined) {
            return this.createHover(envValue, "Environment Variable", range);
        }

        return this.createUnresolvedHover(variableName, range);
    }

    private createSystemVariableHover(
        variableName: string,
        range: vscode.Range,
    ): vscode.Hover {
        const baseVar = variableName.split(" ")[0];
        const info = SYSTEM_VARIABLE_INFO[baseVar];

        let preview: string;
        if (baseVar === "$timestamp") {
            preview = Math.floor(Date.now() / 1000).toString();
        } else if (baseVar === "$guid") {
            preview = crypto.randomUUID();
        } else if (baseVar === "$randomInt") {
            const match = variableName.match(/\$randomInt\s+(-?\d+)\s+(-?\d+)/);
            if (match) {
                const min = parseInt(match[1]);
                const max = parseInt(match[2]);
                preview = `${Math.floor(Math.random() * (max - min)) + min}`;
            } else {
                preview = "(specify min max)";
            }
        } else if (baseVar === "$processEnv") {
            const match = variableName.match(/\$processEnv\s+(\w+)/);
            if (match) {
                preview = process.env[match[1]] ?? "(not set)";
            } else {
                preview = "(specify variable name)";
            }
        } else {
            preview = "(unknown)";
        }

        const md = new vscode.MarkdownString();
        md.appendCodeblock(preview, "text");
        md.appendMarkdown(`\n**System Variable** — ${info?.description ?? baseVar}`);

        return new vscode.Hover(md, range);
    }

    private createHover(
        value: string,
        type: string,
        range: vscode.Range,
    ): vscode.Hover {
        const md = new vscode.MarkdownString();
        md.appendCodeblock(value, "text");
        md.appendMarkdown(`\n**${type}**`);
        return new vscode.Hover(md, range);
    }

    private createUnresolvedHover(
        variableName: string,
        range: vscode.Range,
    ): vscode.Hover {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Unresolved:** \`${variableName}\`\n\n`);
        md.appendMarkdown("Not found in environment or file variables.");
        return new vscode.Hover(md, range);
    }

    private findFileVariable(
        name: string,
        document: vscode.TextDocument,
    ): string | undefined {
        const lines = document.getText().split("\n");
        for (const line of lines) {
            const match = FILE_VARIABLE_REGEX.exec(line);
            if (match && match[1] === name) {
                return match[2];
            }
        }
        return undefined;
    }

    private async findEnvironmentVariable(
        name: string,
        document: vscode.TextDocument,
    ): Promise<string | undefined> {
        const workspaceFolder =
            vscode.workspace.getWorkspaceFolder(document.uri) ??
            vscode.workspace.workspaceFolders?.[0];

        const envFile = await readRestClientEnvFile(workspaceFolder);
        const environment = resolveEnvironmentFromEnvFile(envFile);

        const variable = environment?.variables.find((v) => v.key === name);
        return variable?.value;
    }

    private getVariableRange(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Range | undefined {
        const line = document.lineAt(position.line).text;
        const regex = /\{\{([^}]+)\}\}/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line))) {
            const start = match.index;
            const end = match.index + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new vscode.Range(position.line, start, position.line, end);
            }
        }
        return undefined;
    }
}
