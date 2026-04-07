# Development Conventions

## Code Style & Standards
- **TypeScript:** Strict type checking is enforced. Follow **SOLID principles** for all class designs.
- **SCSS & BEM:** Use SCSS for all styles.
  - **BEM Convention:** Blocks and elements should be clear. Modifiers **MUST NOT** repeat the base class name when nested.
  - **Example:**
    ```scss
    .progress-bar {
      height: 8px;
      &--critical { background: red; } // Results in .progress-bar--critical
    }
    ```
- **Linting:** Follows `eslint.config.mjs`.

## Extension Logic
- **Data Fetching:** Encapsulated in a dedicated service to allow for future provider extensions.
- **UI Refresh:** 30-second polling interval ensures the status bar and dashboard stay current.

## Testing
- **Location:** `src/test/`
- **Pattern:** Test files must match `**.test.ts`.
- **Framework:** Mocha via `@vscode/test-cli`.

## Command Registry
- `rateLimitUsage.showDashboard`: Opens the Codex Usage Dashboard.
