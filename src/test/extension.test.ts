import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildDashboardState } from '../services/dashboardState';
import { CodexUsageService, resolveSubscriptionPlan } from '../services/codexUsageService';
import { ScanSettings } from '../shared/types';

suite('Rate Limit Usage', () => {
    const settings: ScanSettings = {
        deepScanIntervalHours: 24,
        pricingModelPreference: 'auto',
        defaultChartTimeframe: '1W',
        subscriptionOverride: 'auto',
    };

    test('aggregates Codex usage, pricing, and latest rate limits from session logs', () => {
        const now = Date.parse('2026-04-07T04:00:00.000Z');
        const sessionsDir = createSessionsDir([
            {
                relativePath: path.join('2026', '04', '07', 'session-a.jsonl'),
                contents: [
                    createTurnContext('gpt-5.4-mini'),
                    createTokenCountEvent('2026-04-07T02:10:00.000Z', {
                        input_tokens: 100000,
                        cached_input_tokens: 50000,
                        output_tokens: 2000,
                        reasoning_output_tokens: 100,
                        total_tokens: 102000,
                    }, 18, 44),
                    createTokenCountEvent('2026-04-07T03:10:00.000Z', {
                        input_tokens: 200000,
                        cached_input_tokens: 100000,
                        output_tokens: 3000,
                        reasoning_output_tokens: 150,
                        total_tokens: 203000,
                    }, 22, 48),
                ],
            },
        ], now);

        const service = new CodexUsageService({
            sessionsDir,
            now: () => now,
        });

        const snapshot = service.getSnapshot(settings);
        assert.strictEqual(snapshot.today.inputTokens, 300000);
        assert.strictEqual(snapshot.today.cachedInputTokens, 150000);
        assert.strictEqual(snapshot.today.outputTokens, 5000);
        assert.strictEqual(snapshot.today.totalTokens, 305000);
        assert.strictEqual(snapshot.plan, 'plus');
        assert.strictEqual(snapshot.actualMonthlySpend, 20);
        assert.strictEqual(snapshot.latestRate?.fiveHour.usedPercent, 22);
        assert.strictEqual(snapshot.latestRate?.weekly.usedPercent, 48);
        assert.ok(Math.abs(snapshot.today.totalCost - 0.25875) < 0.000001);
        assert.match(snapshot.pricingModelSummary, /GPT-5\.4 mini/i);
    });

    test('dashboard state exposes usage cards, metrics, and trends', () => {
        const now = Date.parse('2026-04-07T04:00:00.000Z');
        const sessionsDir = createSessionsDir([
            {
                relativePath: path.join('2026', '04', '06', 'session-a.jsonl'),
                contents: [
                    createTurnContext('gpt-5.4'),
                    createTokenCountEvent('2026-04-06T04:00:00.000Z', {
                        input_tokens: 50000,
                        cached_input_tokens: 10000,
                        output_tokens: 1000,
                        reasoning_output_tokens: 0,
                        total_tokens: 51000,
                    }, 12, 40),
                ],
            },
            {
                relativePath: path.join('2026', '04', '07', 'session-b.jsonl'),
                contents: [
                    createTurnContext('gpt-5.4'),
                    createTokenCountEvent('2026-04-07T03:30:00.000Z', {
                        input_tokens: 50000,
                        cached_input_tokens: 10000,
                        output_tokens: 1000,
                        reasoning_output_tokens: 0,
                        total_tokens: 51000,
                    }, 33, 67),
                ],
            },
        ], now);

        const service = new CodexUsageService({
            sessionsDir,
            now: () => now,
        });

        const dashboardState = buildDashboardState(service.getSnapshot(settings));
        assert.strictEqual(dashboardState.usageCards.length, 2);
        assert.strictEqual(dashboardState.todayStats[0].label, 'Total Tokens Today');
        assert.strictEqual(dashboardState.financialStats[1].label, 'API Equivalent (30D)');
        assert.strictEqual(dashboardState.defaultTimeframe, '1W');
        assert.strictEqual(dashboardState.trends.length, 3);
        assert.ok(dashboardState.trends[0].path.startsWith('M '));
        assert.match(dashboardState.pricingSummary, /pricing reference/i);
    });

    test('subscription override takes precedence over detected plan', () => {
        assert.strictEqual(resolveSubscriptionPlan('plus', 'pro'), 'pro');
        assert.strictEqual(resolveSubscriptionPlan(undefined, 'auto'), 'unknown');
    });
});

function createSessionsDir(
    files: Array<{ relativePath: string; contents: string[] }>,
    now: number
): string {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rate-limit-usage-'));
    for (const file of files) {
        const fullPath = path.join(rootDir, file.relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, `${file.contents.join('\n')}\n`, 'utf8');
        fs.utimesSync(fullPath, new Date(now), new Date(now));
    }
    return rootDir;
}

function createTurnContext(model: string): string {
    return JSON.stringify({
        timestamp: '2026-04-07T01:00:00.000Z',
        type: 'turn_context',
        payload: {
            model,
        },
    });
}

function createTokenCountEvent(
    timestamp: string,
    usage: Record<string, number>,
    fiveHourPct: number,
    weeklyPct: number
): string {
    return JSON.stringify({
        timestamp,
        type: 'event_msg',
        payload: {
            type: 'token_count',
            info: {
                last_token_usage: usage,
            },
            rate_limits: {
                primary: {
                    used_percent: fiveHourPct,
                    window_minutes: 300,
                    resets_at: 1775559184,
                },
                secondary: {
                    used_percent: weeklyPct,
                    window_minutes: 10080,
                    resets_at: 1775792011,
                },
                plan_type: 'plus',
            },
        },
    });
}
