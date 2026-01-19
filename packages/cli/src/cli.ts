#!/usr/bin/env node

import { Command } from "commander";
import { config } from "dotenv";
import { DEFAULT_API_URL, loadAuthConfig } from "./auth-config.js";
import { analyzeCommand } from "./commands/analyze.js";
import { analyze2Command } from "./commands/analyze2.js";
import { checkCommand } from "./commands/check.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { syncCommand } from "./commands/sync.js";
import { verifyCommand } from "./commands/verify.js";

// Load .env file
config();

const program = new Command();

program
  .name("watchapi")
  .description(
    "CLI tool for API monitoring and regression detection in CI/CD pipelines",
  )
  .version("0.1.0");

program
  .command("analyze")
  .description(
    "Analyze APIs (Next.js App Router, Next.js tRPC, or Nest controllers) for consistency",
  )
  .option("-t, --target <target>", "Adapter target (auto-detects when omitted)")
  .option("--root <path>", "Project root to scan", process.cwd())
  .option("--tsconfig <path>", "Path to tsconfig", "tsconfig.json")
  .option(
    "--include <globs...>",
    "Glob(s) for router files or OpenAPI spec path/URL",
  )
  .option("--format <format>", "Output format: table | json", "table")
  .option("-v, --verbose", "Enable verbose logging", false)
  .option(
    "--router-factory <names...>",
    "Router factory identifiers to detect (comma separated or repeat flag)",
  )
  .option(
    "--router-identifier-pattern <regex>",
    "Regex to detect router identifiers (default: /router$/i)",
  )
  .action(async (options) => {
    await analyzeCommand({
      target: options.target,
      root: options.root,
      tsconfig: options.tsconfig,
      include: options.include,
      format: options.format,
      verbose: options.verbose,
      routerFactory: options.routerFactory,
      routerIdentifierPattern: options.routerIdentifierPattern,
    });
  });

program
  .command("analyze2")
  .description(
    "Parse APIs using the shared parsers package (deterministic, no heuristics)",
  )
  .option("-t, --target <target>", "Parser target: trpc | next-app | auto", "auto")
  .option("--root <path>", "Project root to scan", process.cwd())
  .option("--tsconfig <path>", "Path to tsconfig", "tsconfig.json")
  .option("--include <globs...>", "Glob(s) for source files")
  .option("--format <format>", "Output format: table | json", "table")
  .option("-v, --verbose", "Enable verbose logging", false)
  .option(
    "--router-factory <names...>",
    "Router factory identifiers to detect (tRPC only)",
  )
  .option(
    "--router-identifier-pattern <regex>",
    "Regex to detect router identifiers (tRPC only)",
  )
  .action(async (options) => {
    await analyze2Command({
      target: options.target,
      root: options.root,
      tsconfig: options.tsconfig,
      include: options.include,
      format: options.format,
      verbose: options.verbose,
      routerFactory: options.routerFactory,
      routerIdentifierPattern: options.routerIdentifierPattern,
    });
  });

program
  .command("check")
  .description("Run API checks for a collection")
  .requiredOption("-c, --collection <id>", "Collection ID to check")
  .option(
    "-e, --env <environment>",
    "Environment name (e.g., production, staging)",
    "production",
  )
  .option("--api-url <url>", "API platform URL")
  .option("--api-token <token>", "API authentication token")
  .option(
    "--fail-on <mode>",
    "When to fail the CI/CD pipeline (any|regressions)",
    "regressions",
  )
  .action(async (options) => {
    const storedAuth = loadAuthConfig();
    const apiUrl =
      options.apiUrl ||
      process.env.WATCHAPI_URL ||
      storedAuth?.apiUrl ||
      DEFAULT_API_URL;
    const apiToken =
      options.apiToken || process.env.WATCHAPI_TOKEN || storedAuth?.apiToken;

    if (!apiToken) {
      console.error(
        "Error: API token is required. Set WATCHAPI_TOKEN env var or use --api-token",
      );
      process.exit(1);
    }

    await checkCommand({
      collection: options.collection,
      env: options.env,
      apiUrl,
      apiToken,
      failOn: options.failOn as "any" | "regressions",
    });
  });

program
  .command("login")
  .description("Save credentials locally for reuse")
  .option("--api-token <token>", "API authentication token")
  .option("--api-url <url>", "API platform URL")
  .action(async (options) => {
    await loginCommand({
      apiToken: options.apiToken,
      apiUrl: options.apiUrl,
    });
  });

program
  .command("logout")
  .description("Remove locally saved credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("sync")
  .description(
    "Sync API surface from code (Next.js App Router/tRPC) or Nest OpenAPI specs to the monitoring platform",
  )
  .option("-t, --target <target>", "Adapter target (auto-detects when omitted)")
  .option("--root <path>", "Project root to scan", process.cwd())
  .option("--tsconfig <path>", "Path to tsconfig", "tsconfig.json")
  .option(
    "--include <globs...>",
    "Glob(s) for router files or OpenAPI spec path/URL",
  )
  .option(
    "--prefix <path>",
    "Optional path prefix to prepend to synced endpoints",
  )
  .option(
    "--domain <url>",
    "Base domain to prepend to synced endpoints (e.g. https://api.example.com)",
  )
  .option("--api-url <url>", "API platform URL")
  .option("--api-token <token>", "API authentication token")
  .option("--dry-run", "Print detected APIs without syncing", false)
  .option("-v, --verbose", "Enable verbose logging", false)
  .option(
    "--router-factory <names...>",
    "Router factory identifiers to detect (comma separated or repeat flag)",
  )
  .option(
    "--router-identifier-pattern <regex>",
    "Regex to detect router identifiers (default: /router$/i)",
  )
  .action(async (options) => {
    await syncCommand({
      target: options.target,
      root: options.root,
      tsconfig: options.tsconfig,
      include: options.include,
      prefix: options.prefix,
      domain: options.domain,
      apiUrl: options.apiUrl,
      apiToken: options.apiToken,
      dryRun: options.dryRun,
      verbose: options.verbose,
      routerFactory: options.routerFactory,
      routerIdentifierPattern: options.routerIdentifierPattern,
    });
  });

program
  .command("verify")
  .description(
    "Mark endpoints as verified after deployment or testing",
  )
  .option("-c, --collection <id>", "Collection ID to verify all endpoints")
  .option("-e, --endpoint <id>", "Specific endpoint ID to verify")
  .option(
    "--env <environment>",
    "Environment name (e.g., production, staging)",
  )
  .option("--commit <hash>", "Git commit hash")
  .option("--api-url <url>", "API platform URL")
  .option("--api-token <token>", "API authentication token")
  .action(async (options) => {
    const storedAuth = loadAuthConfig();
    const apiUrl =
      options.apiUrl ||
      process.env.WATCHAPI_URL ||
      storedAuth?.apiUrl ||
      DEFAULT_API_URL;
    const apiToken =
      options.apiToken || process.env.WATCHAPI_TOKEN || storedAuth?.apiToken;

    if (!apiToken) {
      console.error(
        "Error: API token is required. Set WATCHAPI_TOKEN env var or use --api-token",
      );
      process.exit(1);
    }

    await verifyCommand({
      collection: options.collection,
      endpoint: options.endpoint,
      env: options.env,
      commit: options.commit,
      apiUrl,
      apiToken,
    });
  });

program.parse();
