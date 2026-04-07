# Repository Guidelines

This file serves as the high-level entry point for contributor guidance for the **Rate Limit Usage** VS Code extension. For implementation and workflow details, use the documents in `docs/`.

## Quick Links

### Contributor Workflow
- **[Contributing Workflow](docs/solution/contributing.md)**: Project structure, validation steps, commit format, and pull request expectations.
- **[Setup & Execution](docs/solution/setup.md)**: Install, build, watch, test, package, and local debug commands.
- **[Development Conventions](docs/solution/conventions.md)**: Source layout, TypeScript rules, linting, and test placement.

### Product & Architecture
- **[Product Requirements Document (PRD)](docs/requirement/prd.md)**: Goals, features, and scope.
- **[Architecture & Design](docs/solution/architecture.md)**: Extension design, data source, and dashboard/status bar behavior.

## Project Summary
**Rate Limit Usage** monitors Codex 5-hour and 7-day rolling usage inside VS Code. The extension reads local session logs, updates the status bar on a polling interval, and renders a dashboard webview for detailed usage visibility.

## Documentation Rule
Keep `AGENTS.md` as the index. Put detailed contributor instructions in the matching files under `docs/solution/`, then update the links here when new contributor-facing documentation is added.
