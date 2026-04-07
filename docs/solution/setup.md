# Setup & Execution

## Prerequisites
- Node.js and npm
- [VS Code Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner) (recommended for testing)

## Key Commands
- **Install Dependencies:** `npm install`
- **Compile:** `npm run compile` (Runs type checks, linting, and esbuild)
- **Development (Watch):** `npm run watch` (Runs esbuild and tsc in watch mode)
- **Run/Debug:** Press `F5` in VS Code to launch a "Extension Development Host" instance.
- **Test:** `npm run test` (Executes tests using `@vscode/test-cli`)
- **Lint:** `npm run lint` (Runs ESLint on `src/`)
- **Package:** `npm run package` (Creates a production build in `dist/`)
