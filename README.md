# Rate Limit Usage

`Rate Limit Usage` is a VS Code extension for tracking Codex rolling usage and translating that activity into an API-equivalent cost view.

## Features

- Status bar visibility for the Codex 5-hour and 7-day rolling windows.
- Dashboard progress cards with reset timers and threshold-aware coloring.
- Today's token breakdown for input, cached input, and output tokens.
- API-equivalent cost estimates using OpenAI pricing references for the GPT-5.4 family.
- Financial analysis cards for subscription cost, 30-day API equivalent, projected monthly spend, and value delta.
- Trend chart with `1D`, `1W`, and `1M` views.
- Deep log scans cached on an interval, with lighter refreshes in between.

## How It Works

- The extension recursively scans `~/.codex/sessions/` for `.jsonl` session logs.
- It uses `token_count` events for usage deltas and server-reported rate limit percentages.
- When possible, it infers the active model from session context and applies the matching pricing reference.
- No local database is used. Metrics are rebuilt from logs each time the extension refreshes.

## Settings

This extension contributes the following settings:

- `rateLimitUsage.deepScanIntervalHours`: hours between deep rescans of session history.
- `rateLimitUsage.pricingModelPreference`: pricing reference override for API-equivalent calculations.
- `rateLimitUsage.defaultChartTimeframe`: default trend timeframe shown in the dashboard.
- `rateLimitUsage.subscriptionOverride`: manual Plus or Pro override for financial analysis.

## Development

- `npm install`
- `npm run compile`
- `npm run watch`
- `npm run test`
- Press `F5` in VS Code to launch an Extension Development Host.
