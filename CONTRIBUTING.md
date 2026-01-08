# Contributing to WatchAPI Client

Thank you for your interest in contributing to WatchAPI Client! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment
4. Create a new branch for your contribution
5. Make your changes
6. Test your changes
7. Submit a pull request

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/) (v9 or higher)
- [Visual Studio Code](https://code.visualstudio.com/)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/watchapi-client.git
cd watchapi-client

# Install dependencies
pnpm install

# Build the extension
pnpm run compile
```

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to open a new VS Code window with the extension loaded
3. Test your changes in the Extension Development Host window

### Available Scripts

```bash
pnpm run compile        # Compile TypeScript
pnpm run watch          # Watch mode for development
pnpm run lint           # Run ESLint
pnpm run check-types    # TypeScript type checking
pnpm run package        # Build production package
pnpm run vscode:package # Create .vsix package
```

## How to Contribute

### Reporting Bugs

Before submitting a bug report:
- Check the [existing issues](../../issues) to avoid duplicates
- Update to the latest version to see if the issue persists
- Collect information about your environment (OS, VS Code version, extension version)

When submitting a bug report, include:
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots or GIFs if applicable
- Environment details
- Any relevant error messages or logs

### Suggesting Features

Feature requests are welcome! Before submitting:
- Check existing issues and discussions
- Ensure the feature aligns with project goals
- Consider if it could be implemented as a separate extension

When suggesting a feature:
- Provide a clear use case
- Explain the expected behavior
- Consider alternative solutions
- Include mockups or examples if applicable

### Code Contributions

Areas where contributions are especially welcome:
- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage
- New parser support (frameworks, libraries)
- UI/UX enhancements

## Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make Your Changes**
   - Write clear, self-documenting code
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass
   - Follow the coding standards

3. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

4. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes you made and why
   - Include screenshots for UI changes
   - Ensure CI checks pass

6. **Review Process**
   - Maintainers will review your PR
   - Address any requested changes
   - Once approved, your PR will be merged

## Coding Standards

### TypeScript Style

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use async/await over promises when possible
- Add JSDoc comments for public APIs

### File Organization

```
src/
├── extension.ts           # Extension entry point
├── commands/              # Command implementations
├── parsers/              # Framework-specific parsers
├── providers/            # Tree data providers
├── services/             # Business logic
├── storage/              # Data persistence
├── ui/                   # UI components (webviews)
└── utils/                # Shared utilities
```

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (no `I` prefix)
- **Types**: `PascalCase`

### Code Quality

- Run `pnpm run lint` before committing
- Run `pnpm run check-types` to verify TypeScript
- Write self-documenting code
- Add comments for complex logic
- Keep functions small and focused

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(parser): add support for NestJS decorators

fix(ui): resolve endpoint tree not updating on delete

docs: update installation instructions

refactor(storage): simplify endpoint persistence logic
```

## Testing

- Add tests for new features
- Ensure existing tests pass
- Test manually in VS Code Extension Development Host
- Test with different frameworks (Next.js, NestJS, tRPC)

## Questions?

- Open a [Discussion](../../discussions) for general questions
- Open an [Issue](../../issues) for bug reports or feature requests
- Check existing documentation and issues first

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to WatchAPI Client! 🎉
