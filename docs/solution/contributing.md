# Contributing Workflow

## Project Structure
- Keep implementation code in `src/`.
- `src/extension.ts` is the extension entry point.
- `src/dashboard.html` contains the dashboard webview template.
- Put tests in `src/test/`.
- Treat `dist/`, `out/`, and `*.vsix` as generated output.

## Build, Test, and Local Development
- `npm install`: install dependencies.
- `npm run compile`: run type-checking, linting, and esbuild.
- `npm run watch`: start watch mode for TypeScript and esbuild.
- `npm run test`: run the VS Code extension test suite.
- `npm run package`: produce the production bundle in `dist/`.
- Press `F5` in VS Code to launch an Extension Development Host for manual verification.

## Coding Standards
- Keep TypeScript in `strict` mode.
- Follow the repo style already in use: 4-space indentation, single quotes, and semicolons.
- Use `camelCase` for variables and functions, `PascalCase` for types and classes.
- Keep command IDs namespaced, for example `rateLimitUsage.showDashboard`.
- Follow `eslint.config.mjs` and the conventions in `docs/solution/conventions.md`.

## Testing Expectations
- Add or update tests when changing parsing, formatting, or dashboard state logic.
- Name test files `*.test.ts`.
- Run `npm run test` before opening a pull request.
- If a change is mainly visual, include the manual verification steps in the PR.

## Commit and Pull Requests
- Use Conventional Commits as seen in project history, for example `feat: update dashboard layout`.
- Keep commits focused and explain the user-visible or technical change clearly.
- PRs should include a short summary, linked issue or requirement when relevant, validation commands run, and screenshots for UI changes.
