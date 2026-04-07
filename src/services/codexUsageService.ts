import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { calculateUsageCost, getPricingModelLabel, resolvePricingModel } from '../shared/pricing';
import {
    DeepScanCache,
    LatestRateSnapshot,
    LightRefreshResult,
    PricingModelKey,
    ScanSettings,
    SubscriptionPlan,
    UsageAggregate,
    UsageSnapshot,
    UsageTokens,
} from '../shared/types';
import { buildDailyLabels, buildHourlyLabels, getLookbackStart, toDayKey, toHourKey } from '../utils/time';
import { addUsage, cloneUsageAggregate, createEmptyUsageAggregate, mergeUsage } from '../utils/usage';

interface ParsedFileResult {
    dailyBuckets: Record<string, UsageAggregate>;
    hourlyBuckets: Record<string, UsageAggregate>;
    latestRate: LatestRateSnapshot | null;
    detectedPlanType: string | undefined;
    recentModelUsage: Partial<Record<PricingModelKey, number>>;
}

interface ServiceOptions {
    sessionsDir?: string;
    now?: () => number;
}

export class CodexUsageService {
    private readonly sessionsDir: string;
    private readonly nowProvider: () => number;
    private cache: DeepScanCache | null = null;

    public constructor(options?: ServiceOptions) {
        this.sessionsDir = options?.sessionsDir ?? path.join(os.homedir(), '.codex', 'sessions');
        this.nowProvider = options?.now ?? (() => Date.now());
    }

    public getSnapshot(settings: ScanSettings): UsageSnapshot {
        const now = this.nowProvider();
        const deepScanExpired =
            this.cache === null ||
            now - this.cache.generatedAt >= settings.deepScanIntervalHours * 60 * 60 * 1000;

        if (deepScanExpired) {
            this.cache = this.runDeepScan(settings, now);
        }

        const lightRefresh = deepScanExpired ? null : this.runLightRefresh(settings, now);
        return this.buildSnapshot(settings, now, lightRefresh);
    }

    private buildSnapshot(
        settings: ScanSettings,
        now: number,
        lightRefresh: LightRefreshResult | null
    ): UsageSnapshot {
        if (!this.cache) {
            throw new Error('Usage cache was not initialized before snapshot creation.');
        }

        const dailyBuckets = this.cloneAggregateRecord(this.cache.dailyBuckets);
        const hourlyBuckets = lightRefresh
            ? this.cloneAggregateRecord(lightRefresh.hourlyBuckets)
            : this.cloneAggregateRecord(this.cache.hourlyBuckets);
        const latestRate = lightRefresh?.latestRate ?? this.cache.latestRate;
        const recentModelUsage = { ...this.cache.recentModelUsage };

        if (lightRefresh) {
            for (const [dayKey, aggregate] of Object.entries(lightRefresh.dailyBuckets)) {
                dailyBuckets[dayKey] = cloneUsageAggregate(aggregate);
            }

            for (const [model, totalTokens] of Object.entries(lightRefresh.recentModelUsage)) {
                recentModelUsage[model as PricingModelKey] = totalTokens;
            }
        }

        const todayKey = toDayKey(now);
        const today = cloneUsageAggregate(dailyBuckets[todayKey] ?? createEmptyUsageAggregate());
        const trailing30Days = mergeUsage(...Object.values(dailyBuckets));
        const plan = resolveSubscriptionPlan(
            lightRefresh?.detectedPlanType ?? this.cache.detectedPlanType,
            settings.subscriptionOverride
        );
        const actualMonthlySpend = plan === 'unknown' ? null : getSubscriptionCost(plan);

        return {
            generatedAt: now,
            deepScannedAt: this.cache.generatedAt,
            scanMode: lightRefresh ? 'light' : 'deep',
            filesScanned: (lightRefresh?.filesScanned ?? 0) + this.cache.filesScanned,
            latestRate,
            today,
            trailing30Days,
            dailyTrend: buildDailyTrend(now, dailyBuckets, 30),
            hourlyTrend: buildHourlyTrend(now, hourlyBuckets),
            plan,
            actualMonthlySpend,
            pricingModelSummary: summarizePricingModelUsage(recentModelUsage),
            recentModelUsage,
            settings,
        };
    }

    private runDeepScan(settings: ScanSettings, now: number): DeepScanCache {
        const files = this.collectJsonlFiles(getLookbackStart(now, 30));
        const aggregate = this.parseFiles(files, settings, now, getLookbackStart(now, 30));

        return {
            generatedAt: now,
            filesScanned: files.length,
            dailyBuckets: aggregate.dailyBuckets,
            hourlyBuckets: aggregate.hourlyBuckets,
            latestRate: aggregate.latestRate,
            detectedPlanType: aggregate.detectedPlanType,
            recentModelUsage: aggregate.recentModelUsage,
        };
    }

    private runLightRefresh(settings: ScanSettings, now: number): LightRefreshResult {
        const files = this.collectJsonlFiles(now - 48 * 60 * 60 * 1000);
        const aggregate = this.parseFiles(files, settings, now, now - 48 * 60 * 60 * 1000);

        return {
            generatedAt: now,
            filesScanned: files.length,
            dailyBuckets: aggregate.dailyBuckets,
            hourlyBuckets: aggregate.hourlyBuckets,
            latestRate: aggregate.latestRate,
            detectedPlanType: aggregate.detectedPlanType,
            recentModelUsage: aggregate.recentModelUsage,
        };
    }

    private collectJsonlFiles(minModifiedAt: number): string[] {
        if (!fs.existsSync(this.sessionsDir)) {
            return [];
        }

        const files: { file: string; modifiedAt: number }[] = [];
        const visit = (directory: string): void => {
            try {
                for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                    const fullPath = path.join(directory, entry.name);
                    if (entry.isDirectory()) {
                        visit(fullPath);
                        continue;
                    }

                    if (!entry.name.endsWith('.jsonl')) {
                        continue;
                    }

                    const stat = fs.statSync(fullPath);
                    if (stat.mtimeMs >= minModifiedAt) {
                        files.push({ file: fullPath, modifiedAt: stat.mtimeMs });
                    }
                }
            } catch {
                // Ignore unreadable directories and continue scanning other branches.
            }
        };

        visit(this.sessionsDir);
        return files.sort((left, right) => left.modifiedAt - right.modifiedAt).map((entry) => entry.file);
    }

    private parseFiles(
        files: string[],
        settings: ScanSettings,
        now: number,
        minTimestamp: number
    ): ParsedFileResult {
        const dailyBuckets: Record<string, UsageAggregate> = {};
        const hourlyBuckets: Record<string, UsageAggregate> = {};
        const recentModelUsage: Partial<Record<PricingModelKey, number>> = {};
        const hourlyStart = now - 24 * 60 * 60 * 1000;
        let latestRate: LatestRateSnapshot | null = null;
        let detectedPlanType: string | undefined;

        for (const file of files) {
            let currentModel: string | undefined;
            try {
                const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }

                    let event: any;
                    try {
                        event = JSON.parse(line);
                    } catch {
                        continue;
                    }

                    currentModel = extractModelHint(event, currentModel);

                    if (event.type !== 'event_msg' || event.payload?.type !== 'token_count') {
                        continue;
                    }

                    const timestamp = Date.parse(event.timestamp ?? '');
                    if (!Number.isFinite(timestamp)) {
                        continue;
                    }

                    const maybeLatestRate = toLatestRateSnapshot(event.payload?.rate_limits, timestamp);
                    if (maybeLatestRate && (!latestRate || maybeLatestRate.timestamp >= latestRate.timestamp)) {
                        latestRate = maybeLatestRate;
                        detectedPlanType = maybeLatestRate.planType ?? detectedPlanType;
                    }

                    if (timestamp < minTimestamp) {
                        continue;
                    }

                    const usage = toUsageTokens(event.payload?.info?.last_token_usage);
                    if (!usage) {
                        continue;
                    }

                    const pricingModel = resolvePricingModel(currentModel, settings.pricingModelPreference);
                    const cost = calculateUsageCost(usage, pricingModel);
                    const dayKey = toDayKey(timestamp);
                    const dayBucket = dailyBuckets[dayKey] ?? createEmptyUsageAggregate();
                    addUsage(dayBucket, usage, cost);
                    dailyBuckets[dayKey] = dayBucket;

                    if (timestamp >= hourlyStart) {
                        const hourKey = toHourKey(timestamp);
                        const hourBucket = hourlyBuckets[hourKey] ?? createEmptyUsageAggregate();
                        addUsage(hourBucket, usage, cost);
                        hourlyBuckets[hourKey] = hourBucket;
                    }

                    recentModelUsage[pricingModel] = (recentModelUsage[pricingModel] ?? 0) + usage.totalTokens;
                }
            } catch {
                // Ignore unreadable files and keep the dashboard responsive.
            }
        }

        return {
            dailyBuckets,
            hourlyBuckets,
            latestRate,
            detectedPlanType,
            recentModelUsage,
        };
    }

    private cloneAggregateRecord(record: Record<string, UsageAggregate>): Record<string, UsageAggregate> {
        const clone: Record<string, UsageAggregate> = {};
        for (const [key, value] of Object.entries(record)) {
            clone[key] = cloneUsageAggregate(value);
        }
        return clone;
    }
}

function buildDailyTrend(
    now: number,
    dailyBuckets: Record<string, UsageAggregate>,
    days: number
) {
    return buildDailyLabels(now, days).map((point) => {
        const bucket = dailyBuckets[toDayKey(point.timestamp)];
        return {
            ...point,
            value: bucket?.totalCost ?? 0,
        };
    });
}

function buildHourlyTrend(
    now: number,
    hourlyBuckets: Record<string, UsageAggregate>
) {
    return buildHourlyLabels(now).map((point) => {
        const bucket = hourlyBuckets[toHourKey(point.timestamp)];
        return {
            ...point,
            value: bucket?.totalCost ?? 0,
        };
    });
}

function extractModelHint(event: any, currentModel: string | undefined): string | undefined {
    const turnContextModel = event.type === 'turn_context' ? event.payload?.model : undefined;
    if (typeof turnContextModel === 'string' && turnContextModel.trim()) {
        return turnContextModel;
    }

    const sessionModel = event.type === 'session_meta' ? event.payload?.model : undefined;
    if (typeof sessionModel === 'string' && sessionModel.trim()) {
        return sessionModel;
    }

    return currentModel;
}

function toLatestRateSnapshot(rateLimits: any, timestamp: number): LatestRateSnapshot | null {
    if (!rateLimits?.primary || !rateLimits?.secondary) {
        return null;
    }

    return {
        fiveHour: {
            usedPercent: Math.round(rateLimits.primary.used_percent ?? 0),
            windowMinutes: rateLimits.primary.window_minutes ?? 300,
            resetsAt: rateLimits.primary.resets_at,
        },
        weekly: {
            usedPercent: Math.round(rateLimits.secondary.used_percent ?? 0),
            windowMinutes: rateLimits.secondary.window_minutes ?? 10080,
            resetsAt: rateLimits.secondary.resets_at,
        },
        planType: typeof rateLimits.plan_type === 'string' ? rateLimits.plan_type : undefined,
        timestamp,
    };
}

function toUsageTokens(value: any): UsageTokens | null {
    if (!value) {
        return null;
    }

    const inputTokens = Number(value.input_tokens ?? 0);
    const cachedInputTokens = Number(value.cached_input_tokens ?? 0);
    const outputTokens = Number(value.output_tokens ?? 0);
    const reasoningOutputTokens = Number(value.reasoning_output_tokens ?? 0);
    const totalTokens = Number(value.total_tokens ?? inputTokens + outputTokens);

    return {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
    };
}

export function resolveSubscriptionPlan(
    detectedPlanType: string | undefined,
    override: ScanSettings['subscriptionOverride']
): SubscriptionPlan {
    if (override !== 'auto') {
        return override;
    }

    const normalized = detectedPlanType?.toLowerCase();
    if (normalized === 'plus' || normalized === 'pro') {
        return normalized;
    }
    return 'unknown';
}

export function getSubscriptionCost(plan: SubscriptionPlan): number | null {
    if (plan === 'plus') {
        return 20;
    }
    if (plan === 'pro') {
        return 200;
    }
    return null;
}

function summarizePricingModelUsage(usage: Partial<Record<PricingModelKey, number>>): string {
    const ranked = Object.entries(usage)
        .filter((entry): entry is [PricingModelKey, number] => typeof entry[1] === 'number')
        .sort((left, right) => right[1] - left[1]);

    if (ranked.length === 0) {
        return `${getPricingModelLabel('gpt-5.4')} pricing fallback`;
    }

    if (ranked.length === 1) {
        return `${getPricingModelLabel(ranked[0][0])} pricing`;
    }

    return `${getPricingModelLabel(ranked[0][0])} primary, ${ranked.length - 1} additional model(s)`;
}
