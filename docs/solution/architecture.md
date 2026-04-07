# Architecture & Design

## Project Purpose
**Rate Limit Usage** provides real-time monitoring for Codex usage, tracking both the **5-hour window** and the **7-day weekly rolling window**. It ensures developers have immediate visibility into their remaining quota to prevent workflow interruptions.

## Architectural Principles
The project is built following **SOLID principles** to ensure maintainability, scalability, and ease of testing:
- **Single Responsibility:** Each class and module has one clear purpose (e.g., data fetching, UI rendering, state management).
- **Open/Closed:** The system is designed to be open for extension (e.g., adding new providers) but closed for modification.
- **Liskov Substitution:** Interfaces are used to ensure interchangeable components.
- **Interface Segregation:** Clients only depend on the interfaces they actually use.
- **Dependency Inversion:** High-level modules do not depend on low-level modules; both depend on abstractions.

## Technical Stack
- **Language:** TypeScript
- **Styling:** SCSS following **BEM (Block Element Modifier)** conventions.
  - **BEM Rule:** Avoid repeating the base class in modifiers (e.g., use `.block { &--modifier { ... } }` resulting in `.block--modifier`).
- **Entry Point:** `src/extension.ts`
- **Bundler:** `esbuild`
- **UI:** VS Code Webview with SCSS-compiled styling.
- **Data Source:** Parses local `.jsonl` session logs from `~/.codex/sessions/`.
