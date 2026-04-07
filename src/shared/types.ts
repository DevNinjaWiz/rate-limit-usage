export type PricingModelKey = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-nano';
export type PricingModelPreference = 'auto' | PricingModelKey;
export type ChartTimeframe = '1D' | '1W' | '1M';
export type SubscriptionOverride = 'auto' | 'plus' | 'pro';
export type SubscriptionPlan = 'plus' | 'pro' | 'unknown';
export type UsageStatusColor = 'green' | 'yellow' | 'red';

export interface UsageTokens {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
}

export interface UsageAggregate extends UsageTokens {
    totalCost: number;
}

export interface PricingModel {
    key: PricingModelKey;
    label: string;
    inputPerMillion: number;
    cachedInputPerMillion: number;
    outputPerMillion: number;
}

export interface RateWindow {
    usedPercent: number;
    windowMinutes: number;
    resetsAt?: number;
}

export interface LatestRateSnapshot {
    fiveHour: RateWindow;
    weekly: RateWindow;
    planType?: string;
    timestamp: number;
}

export interface ScanSettings {
    deepScanIntervalHours: number;
    pricingModelPreference: PricingModelPreference;
    defaultChartTimeframe: ChartTimeframe;
    subscriptionOverride: SubscriptionOverride;
}

export interface DeepScanCache {
    generatedAt: number;
    filesScanned: number;
    dailyBuckets: Record<string, UsageAggregate>;
    hourlyBuckets: Record<string, UsageAggregate>;
    latestRate: LatestRateSnapshot | null;
    detectedPlanType: string | undefined;
    recentModelUsage: Partial<Record<PricingModelKey, number>>;
}

export interface LightRefreshResult {
    generatedAt: number;
    filesScanned: number;
    dailyBuckets: Record<string, UsageAggregate>;
    hourlyBuckets: Record<string, UsageAggregate>;
    latestRate: LatestRateSnapshot | null;
    detectedPlanType: string | undefined;
    recentModelUsage: Partial<Record<PricingModelKey, number>>;
}

export interface TrendPoint {
    timestamp: number;
    label: string;
    value: number;
}

export interface UsageSnapshot {
    generatedAt: number;
    deepScannedAt: number;
    scanMode: 'deep' | 'light';
    filesScanned: number;
    latestRate: LatestRateSnapshot | null;
    today: UsageAggregate;
    trailing30Days: UsageAggregate;
    dailyTrend: TrendPoint[];
    hourlyTrend: TrendPoint[];
    plan: SubscriptionPlan;
    actualMonthlySpend: number | null;
    pricingModelSummary: string;
    recentModelUsage: Partial<Record<PricingModelKey, number>>;
    settings: ScanSettings;
}

export interface ProgressCardViewModel {
    label: string;
    percentage: number;
    status: string;
    color: UsageStatusColor;
    resetLabel: string;
    windowLabel: string;
}

export interface DashboardMetricViewModel {
    label: string;
    value: string;
    tone?: 'default' | 'accent' | 'muted';
    helper?: string;
}

export interface DashboardTrendViewModel {
    id: ChartTimeframe;
    label: string;
    totalLabel: string;
    points: TrendPoint[];
    path: string;
    yAxisLabels: string[];
}

export interface DashboardState {
    updatedAt: string;
    scanSummary: string;
    pricingSummary: string;
    usageCards: ProgressCardViewModel[];
    todayStats: DashboardMetricViewModel[];
    financialStats: DashboardMetricViewModel[];
    defaultTimeframe: ChartTimeframe;
    trends: DashboardTrendViewModel[];
}
