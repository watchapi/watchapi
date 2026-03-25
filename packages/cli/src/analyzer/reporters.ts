import Table from "cli-table3";
import chalk from "chalk";

import type { AnalyzerIssue, AnalyzerResult } from "./types.js";

export function printReport(
    result: AnalyzerResult,
    format: "table" | "json" = "table",
) {
    const label =
        result.target === "nest"
            ? "Nest analyzer"
            : result.target === "next-app-router"
              ? "Next.js App Router analyzer"
              : "Next.js tRPC analyzer";

    if (format === "json") {
        const payload = { summary: result.summary, issues: result.issues };
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    if (!result.issues.length) {
        console.log(chalk.green(`✓ ${label} – no issues found.`));
        return;
    }

    console.log(
        chalk.bold(
            `${label} – ${result.issues.length} finding${
                result.issues.length === 1 ? "" : "s"
            }`,
        ),
    );

    renderTable(result.issues);

    const { info, warn, error } = result.summary;
    console.log(chalk.dim(`info: ${info}  warn: ${warn}  error: ${error}`));
}

function renderTable(issues: AnalyzerIssue[]) {
    const colWidths = calculateColumnWidths(issues);

    const tableConfig: ConstructorParameters<typeof Table>[0] = {
        head: [
            chalk.bold("Severity"),
            chalk.bold("Router/Path"),
            chalk.bold("Procedure/Method"),
            chalk.bold("Message"),
            chalk.bold("Location"),
            chalk.bold("Rule"),
        ],
        style: { head: [], border: [], "padding-left": 0, "padding-right": 0 },
    };

    if (colWidths) {
        tableConfig.colWidths = colWidths;
        tableConfig.wordWrap = true;
    }

    const table = new Table(tableConfig);

    issues.forEach((issue) => {
        table.push([
            formatSeverity(issue.severity),
            issue.router,
            issue.procedure,
            issue.message,
            `${issue.file}:${issue.line}`,
            issue.rule,
        ]);
    });

    console.log(table.toString());
}

function formatSeverity(severity: AnalyzerIssue["severity"]) {
    const label = severity.toUpperCase();
    if (severity === "error") return chalk.red(label);
    if (severity === "warn") return chalk.yellow(label);
    return chalk.cyan(label);
}

function calculateColumnWidths(issues: AnalyzerIssue[]) {
    const available = process.stdout.columns ?? 0;
    const padding = 8;

    const longestLocation = Math.max(
        "Location".length,
        ...issues.map((issue) => `${issue.file}:${issue.line}`.length),
    );

    const ideal = [8, 22, 12, 36, longestLocation, 14];
    const minimum = [4, 10, 6, 24, longestLocation, 8];
    const floor = [4, 8, 5, 18, longestLocation, 6];

    const totalIdeal = ideal.reduce((sum, width) => sum + width, 0) + padding;
    if (!available || totalIdeal <= available) {
        return ideal;
    }

    const otherColumns = ideal.slice();
    otherColumns[4] = 0;
    const minWithoutLocation =
        otherColumns.reduce((sum, width) => sum + width, 0) +
        padding +
        longestLocation;
    if (minWithoutLocation > available) {
        return null;
    }

    const widths = [...ideal];
    const shrinkOrder = [3, 1, 5, 2, 0];
    let deficit =
        widths.reduce((sum, width) => sum + width, 0) + padding - available;

    for (const index of shrinkOrder) {
        if (deficit <= 0) break;
        const room = widths[index] - minimum[index];
        if (room <= 0) continue;

        const delta = Math.min(room, deficit);
        widths[index] -= delta;
        deficit -= delta;
    }

    if (deficit > 0) {
        for (const index of shrinkOrder) {
            if (deficit <= 0) break;
            const room = widths[index] - floor[index];
            if (room <= 0) continue;

            const delta = Math.min(room, deficit);
            widths[index] -= delta;
            deficit -= delta;
        }
    }

    return widths;
}
