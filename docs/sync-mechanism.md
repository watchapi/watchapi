# Pull Mechanism (Override-Only)

## URL Split Design

### Current Schema
```typescript
url: string  // e.g., "/api/users/123" (mixed template + actual value)
```

### New Schema
```typescript
externalId?: string;  // e.g., "src/app/api/users/[id]/route.ts#GET" - STABLE PULL KEY
pathTemplate: string  // e.g., "/api/users/:id" - from source code (STABLE)
requestPath: string   // e.g., "/api/users/123" - user customized (PRESERVED)
```

## Pull Behavior

### Fields That Get OVERRIDDEN (from source)
- `pathTemplate` - Always updated from source code
- `method` - Always updated from source code
- `name` - Always updated from source code
- `headers` - Always updated from source code (if detected)
- `body` - Always updated from source code (if schema detected)

### Fields That Are PRESERVED (user customizations)
- `requestPath` - User's actual request URL with real values
- `expectedStatus` - User's monitoring expectations
- `timeout` - User's timeout settings
- `interval` - User's check interval
- `isActive` - User's enable/disable state

## External ID (Stable Identifier)

**External ID generation:**
```typescript
generateExternalId(route: ParsedRoute, workspaceRoot: string): string {
  const relativePath = route.filePath.replace(workspaceRoot, "");

  if (route.handlerName) {
    return `${relativePath}#${route.handlerName}`;
  }

  // Include HTTP method to differentiate multiple methods in same file (Next.js)
  return `${relativePath}#${route.method}`;
}
```

**Examples:**
- Next.js App Router: `src/app/api/users/[id]/route.ts#GET`
- tRPC procedure: `src/server/router/user.ts#user.getById`
- NestJS controller: `src/users/users.controller.ts#findOne`

This key:
- ✅ Remains stable even if URL/path changes
- ✅ Tracks endpoint to specific file + handler
- ✅ Survives route refactoring
- ✅ Unique per source location + method

## Pull Flow

1. **Parse routes from source** → Get pathTemplate + generate externalId
2. **Match existing endpoints** → By `externalId`
3. **Update matched endpoints:**
   - Override: pathTemplate, method, name, headers, body
   - Preserve: requestPath, expectedStatus, timeout, interval, isActive
4. **Create new endpoints:**
   - Set externalId, pathTemplate, requestPath (initially same as template)
5. **Deactivate removed endpoints:**
   - Endpoints whose externalId no longer exists in source

## Benefits

1. **Stable pull** - externalId tracks file location, survives URL changes
2. **Preserves user work** - requestPath customizations kept
3. **Clean separation** - Template = source truth, RequestPath = runtime
4. **Route refactoring safe** - Can rename routes without losing endpoint
5. **File-level tracking** - Know exactly which file created each endpoint
