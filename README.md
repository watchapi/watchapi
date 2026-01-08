# WatchAPI - REST Client & API Testing

[![CI](https://github.com/watchapi/watchapi-client/actions/workflows/ci.yml/badge.svg)](https://github.com/watchapi/watchapi-client/actions/workflows/ci.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/watchapi.watchapi-client?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=watchapi.watchapi-client)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/watchapi.watchapi-client)](https://marketplace.visualstudio.com/items?itemName=watchapi.watchapi-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**An API client that reads your code.** Auto-import endpoints from Next.js, NestJS & tRPC. Test and monitor without leaving VS Code.

![WatchAPI](./assets/screenshot-endpoint.png "Execute and inspect API requests inside VS Code")

## Why WatchAPI?

**Stop manually recreating API routes by hand.** WatchAPI auto-discovers endpoints directly from your codebase.

- One click imports all Next.js/NestJS/tRPC routes
- Test requests inside VS Code (no context switching)
- Share collections with your team
- Monitor production uptime and performance

**Free for individuals. Team features available.**

## Features

### Free Forever (Individual Use)

**Auto-Import from Code** - Skip manual setup. Automatically detect API endpoints from:

- **Next.js** - App Router & Pages Router routes
- **NestJS** - Controllers and decorators
- **tRPC** - Router definitions

![WatchAPI](./assets/screenshot-import.png "Import APIs from Next.js or NestJS")

**Full REST Client**

- Execute HTTP requests (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- View response status, headers, and body inline
- Organize endpoints in collections
- Full request customization (headers, body, query params)
- Works 100% offline, no account required
- Local-first storage on your machine

### Team Features (Cloud)

**Collaboration**

- Cloud sync across devices
- Share collections with teammates
- Real-time updates
- Team workspaces

**Monitoring & Alerts**

- Production endpoint health checks
- Uptime tracking and dashboards
- Response time analytics
- Slack/Discord/email notifications
- Custom alert rules

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Click the WatchAPI icon in the activity bar
3. **Pull from Code:** Auto-detect all Next.js/NestJS/tRPC endpoints (recommended)
4. **Or create manually:** Click "New Collection" to add endpoints by hand
5. Click any endpoint to execute and view the response

Works offline by default. Sign in optional (enables team features).

## Comparison

| Feature                    | WatchAPI | Postman | Thunder Client | REST Client |
| -------------------------- | -------- | ------- | -------------- | ----------- |
| Auto-Import Next.js/NestJS | ✓        | ✗       | ✗              | ✗           |
| Native VS Code Extension   | ✓        | ✗       | ✓              | ✓           |
| GUI + Collections          | ✓        | ✓       | ✓              | ✗           |
| Team Collaboration         | ✓        | ✓       | ✓              | ✗           |
| Production Monitoring      | ✓        | ✓       | ✗              | ✗           |
| Free Tier                  | ✓        | Limited | ✓              | ✓           |
| Works Offline              | ✓        | Limited | ✓              | ✓           |

## Privacy & Data

**Local-First & Open Source:**

- All collections stored on your machine by default
- No telemetry or usage tracking
- Optional cloud sync (only when signed in)
- **Open source** under MIT license
- Community-driven development

Privacy Policy: [https://watchapi.dev/privacy](https://watchapi.dev/privacy)

## Contributing

We welcome contributions! WatchAPI Client is open source and community-driven.

- **Read the [Contributing Guide](CONTRIBUTING.md)** to get started
- **Report bugs** via [GitHub Issues](https://github.com/watchapi/watchapi-client/issues)
- **Request features** via [GitHub Discussions](https://github.com/watchapi/watchapi-client/discussions)
- **Submit PRs** - we review and merge regularly
- **Review the [Code of Conduct](CODE_OF_CONDUCT.md)** before contributing

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities.

## Support

- **Report Issues:** [GitHub Issues](https://github.com/watchapi/watchapi-client/issues)
- **Discussions:** [GitHub Discussions](https://github.com/watchapi/watchapi-client/discussions)
- **Documentation:** [docs.watchapi.dev](https://docs.watchapi.dev)
- **Website:** [watchapi.dev](https://watchapi.dev)

## License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

---

**Built by developers who test APIs where they write code.**
