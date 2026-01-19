import path from "node:path";

import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";

import {
  parseTRPCRouters,
  parseNextAppRoutes,
  hasTRPC,
  hasNextApp,
  type ParsedRoute,
} from "@watchapi/parsers";

export type Analyze2Target = "trpc" | "next-app" | "auto";

export interface Analyze2CommandOptions {
  target?: Analyze2Target;
  root?: string;
  tsconfig?: string;
  include?: string[];
  format?: "table" | "json";
  verbose?: boolean;
  routerFactory?: string[];
  routerIdentifierPattern?: string;
}

interface Analyze2Result {
  target: string;
  routes: ParsedRoute[];
}

export async function analyze2Command(
  options: Analyze2CommandOptions,
): Promise<void> {
  const rootDir = path.resolve(options.root ?? process.cwd());
  const format = options.format === "json" ? "json" : "table";
  const verbose = options.verbose ?? false;

  // Auto-detect target if not specified
  let target = options.target;
  if (!target || target === "auto") {
    target = detectTarget(rootDir, verbose);
    if (verbose) {
      console.log(chalk.gray(`Auto-detected target: ${target}`));
    }
  }

  const spinnerLabel =
    target === "trpc"
      ? "Parsing tRPC procedures..."
      : "Parsing Next.js App Router routes...";

  const spinner = verbose ? null : ora(spinnerLabel).start();

  try {
    const result = await runParser(rootDir, target, options);

    const finishedMsg = `Found ${result.routes.length} route${
      result.routes.length === 1 ? "" : "s"
    }`;

    if (spinner) {
      spinner.succeed(finishedMsg);
    } else {
      console.log(finishedMsg);
    }

    printResult(result, format);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parser failure";

    if (spinner) {
      spinner.fail(chalk.red(message));
    } else {
      console.error(chalk.red(message));
    }

    process.exit(1);
  }
}

function detectTarget(rootDir: string, verbose: boolean): Analyze2Target {
  if (hasTRPC(rootDir)) {
    if (verbose) {
      console.log(chalk.gray("Detected @trpc/server in package.json"));
    }
    return "trpc";
  }

  if (hasNextApp(rootDir)) {
    if (verbose) {
      console.log(chalk.gray("Detected next in package.json"));
    }
    return "next-app";
  }

  // Default to next-app if nothing detected
  return "next-app";
}

async function runParser(
  rootDir: string,
  target: Analyze2Target,
  options: Analyze2CommandOptions,
): Promise<Analyze2Result> {
  const parseOptions = {
    rootDir,
    tsconfigPath: options.tsconfig,
    include: options.include,
    verbose: options.verbose,
    routerFactories: options.routerFactory,
    routerIdentifierPattern: options.routerIdentifierPattern,
  };

  if (target === "trpc") {
    const result = parseTRPCRouters(parseOptions);
    return {
      target: "trpc",
      routes: result.routes,
    };
  }

  // Default to next-app
  const result = parseNextAppRoutes(parseOptions);
  return {
    target: "next-app",
    routes: result.routes,
  };
}

function printResult(result: Analyze2Result, format: "table" | "json"): void {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.routes.length === 0) {
    console.log(chalk.yellow("\nNo routes found."));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan("Method"),
      chalk.cyan("Path"),
      chalk.cyan("File"),
      chalk.cyan("Type"),
    ],
    style: {
      head: [],
      border: [],
    },
  });

  for (const route of result.routes) {
    const methodColor = getMethodColor(route.method);
    table.push([
      methodColor(route.method),
      route.path,
      path.relative(process.cwd(), route.filePath),
      route.type,
    ]);
  }

  console.log("\n" + table.toString());

  // Print summary
  const methodCounts = result.routes.reduce(
    (acc, route) => {
      acc[route.method] = (acc[route.method] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const summaryParts = Object.entries(methodCounts)
    .map(([method, count]) => `${method}: ${count}`)
    .join(", ");

  console.log(chalk.gray(`\nSummary: ${summaryParts}`));
}

function getMethodColor(method: string): (text: string) => string {
  switch (method) {
    case "GET":
      return chalk.green;
    case "POST":
      return chalk.blue;
    case "PUT":
      return chalk.yellow;
    case "PATCH":
      return chalk.magenta;
    case "DELETE":
      return chalk.red;
    default:
      return chalk.white;
  }
}
