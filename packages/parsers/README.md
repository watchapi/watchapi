# @watchapi/parsers

Shared parsers for extracting API endpoints from Next.js, NestJS, and tRPC projects.

## Overview

This package provides TypeScript AST-based parsers that can detect and extract API route information from popular web frameworks. It's used by both the WatchAPI VSCode extension and CLI tool.

## Features

- **Next.js Parser**: Supports both App Router (`app/api`) and Pages Router (`pages/api`) patterns
- **tRPC Parser**: Detects tRPC routers and procedures
- **NestJS Parser**: Extracts routes from NestJS controllers
- **Zod Schema Parser**: Extracts body examples from Zod validation schemas
- **HTTP Format**: Parse and construct .http files compatible with REST Client format

## Installation

```bash
pnpm add @watchapi/parsers
```

## Usage

### Next.js Routes

```typescript
import { parseAllNextJsRoutes, hasNextJs } from '@watchapi/parsers';

// Check if Next.js is installed
const isNextProject = await hasNextJs();

// Parse all Next.js routes
if (isNextProject) {
  const routes = await parseAllNextJsRoutes();
  console.log(routes);
}
```

### tRPC Routes

```typescript
import { parseTRPCRouters, hasTRPC } from '@watchapi/parsers';

// Check if tRPC is installed
const isTrpcProject = await hasTRPC();

// Parse all tRPC routes
if (isTrpcProject) {
  const routes = await parseTRPCRouters();
  console.log(routes);
}
```

### NestJS Routes

```typescript
import { parseNestJsRoutes, hasNestJs } from '@watchapi/parsers';

// Check if NestJS is installed
const isNestProject = await hasNestJs();

// Parse all NestJS routes
if (isNestProject) {
  const routes = await parseNestJsRoutes();
  console.log(routes);
}
```

### HTTP File Format

```typescript
import { parseHttpFile, constructHttpFile } from '@watchapi/parsers';

// Parse .http file content
const endpoint = parseHttpFile(content);

// Construct .http file content from endpoint
const httpContent = constructHttpFile(endpoint, env);
```

## Dependencies

- `ts-morph`: TypeScript AST manipulation
- `zod`: Schema validation (peer dependency)
- `flat`: Object flattening utility
- `vscode`: VSCode API (optional peer dependency)

## Architecture

The parsers use TypeScript's AST to accurately detect routes without executing code. This approach provides:

- **Deterministic parsing**: No false positives from comments or strings
- **Safe execution**: No need to run user code
- **Rich metadata**: Extract parameters, body schemas, and more

## License

MIT
