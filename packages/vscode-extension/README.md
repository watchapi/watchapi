# WatchAPI - API Client for Next.js, NestJS & tRPC

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/watchapi/watchapi/actions/workflows/ci.yml/badge.svg)](https://github.com/watchapi/watchapi/actions/workflows/ci.yml)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/watchapi/watchapi-client)](https://open-vsx.org/extension/watchapi/watchapi-client)
<a href="https://discord.gg/5JPCwzASbs">
<img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
</a>

> **Make code as source of truth.** WatchAPI reads your backend code and builds the request collection for you – automatically synced, always up to date.

![WatchAPI auto-import from Next.js / NestJS code](./assets/readme/pull-from-code.gif "Import APIs from Next.js or NestJS")

## What Makes WatchAPI Different

Every other API client (Postman, Thunder Client, Insomnia) makes you write endpoints manually. When you rename a route or add a query param, you have to update your client too. WatchAPI eliminates that entirely.

- **Auto-imports endpoints** from Next.js, NestJS, tRPC, and PayloadCMS
- **Auto-syncs on save** – change a route file, your collection updates instantly
- **Lives in VS Code** – no browser tabs, no context switching, no separate app
- **Local-first** – all data stays on your machine, no account required to start
- **Open source** – MIT licensed, self-hostable

## Quick Start

1. Install from [Marketplace](https://marketplace.visualstudio.com/items?itemName=WatchAPI.watchapi-client) or [Open VSX](https://open-vsx.org/extension/watchapi/watchapi-client)
2. Click the WatchAPI icon in the activity bar
3. Click **Sync from Code** – your endpoints appear automatically

No config files. No manual setup. Works offline out of the box. Sign in only if you want team collaboration features.

![Execute and inspect API requests inside VS Code](./assets/readme/execute-request.gif "Execute and inspect API requests inside VS Code")

## Supported Frameworks

| Framework              | Support |
| ---------------------- | ------- |
| Next.js (App Router)   | Full    |
| NestJS                 | Full    |
| tRPC                   | Full    |
| PayloadCMS             | Full    |
| Next.js (Pages Router) | Partial |

## WatchAPI vs the Alternatives

| Feature                  | WatchAPI | Postman | Thunder Client | REST Client |
| ------------------------ | -------- | ------- | -------------- | ----------- |
| Auto-import from code    | ✓        | ✗       | ✗              | ✗           |
| Auto-sync on file save   | ✓        | ✗       | ✗              | ✗           |
| Native VS Code extension | ✓        | ✗       | ✓              | ✓           |
| Team collaboration       | ✓        | ✓       | Paid only      | ✗           |
| Production monitoring    | ✓        | ✓       | ✗              | ✗           |
| Free tier                | ✓        | Limited | ✓              | ✓           |
| Works offline            | ✓        | Limited | ✓              | ✓           |
| Open source              | ✓        | ✗       | ✗              | ✓           |

## HTTP File Syntax

WatchAPI uses `.http` files fully compatible with REST Client syntax.

### Basic Request

```http
GET https://api.example.com/users
Authorization: Bearer {{token}}
```

### Request with Body

```http
POST https://api.example.com/users
Content-Type: application/json

{
  "name": "John",
  "email": "john@example.com"
}
```

### Variables

Define variables at the top of your `.http` file:

```http
@baseUrl = https://api.example.com
@token = my-secret-token

GET {{baseUrl}}/users
Authorization: Bearer {{token}}
```

### Environment Variables

Create `rest-client.env.json` in your workspace root:

```json
{
    "local": {
        "baseUrl": "http://localhost:3000",
        "token": "dev-token"
    },
    "production": {
        "baseUrl": "https://api.example.com",
        "token": "prod-token"
    }
}
```

### System Variables

| Variable                 | Description              | Example                   |
| ------------------------ | ------------------------ | ------------------------- |
| `{{$timestamp}}`         | Unix timestamp (seconds) | `1737550800`              |
| `{{$guid}}`              | Random UUID v4           | `f47ac10b-58cc...`        |
| `{{$randomInt min max}}` | Random integer           | `{{$randomInt 1 100}}`    |
| `{{$processEnv VAR}}`    | Process env variable     | `{{$processEnv API_KEY}}` |

## Privacy & Data

**Local-first & open source:**

- All collections stored on your machine by default
- No telemetry or usage tracking
- Optional cloud sync (only when signed in)

[Privacy Policy](https://watchapi.dev/privacy)

## Contributing

- **[Contributing Guide](CONTRIBUTING.md)** – get started
- **[GitHub Issues](https://github.com/watchapi/watchapi/issues)** – report bugs
- **[GitHub Discussions](https://github.com/watchapi/watchapi/discussions)** – request features
- **[Code of Conduct](CODE_OF_CONDUCT.md)**

See [SECURITY.md](SECURITY.md) for security vulnerability reporting.

## Support

- **Docs:** [docs.watchapi.dev](https://docs.watchapi.dev)
- **Website:** [watchapi.dev](https://watchapi.dev)
- **Issues:** [GitHub Issues](https://github.com/watchapi/watchapi/issues)
- **Discord:** [Join the community](https://discord.gg/5JPCwzASbs)

## License

[MIT License](LICENSE)
