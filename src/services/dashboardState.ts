import { PRICING_SOURCE_URL } from '../shared/pricing';
import {
    ChartTimeframe,
    DashboardMetricViewModel,
    DashboardState,
    DashboardTrendViewModel,
    TrendPoint,
    UsageSnapshot,
} from '../shared/types';
import { clamp, formatCurrency, formatNumber, formatResetTime, formatTimestamp } from '../utils/time';
import { getUsageStatusColor, getUsageStatusLabel } from '../utils/usage';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const CHART_PADDING = 20;

export function buildDashboardState(snapshot: UsageSnapshot): DashboardState {
    return {
        updatedAt: formatTimestamp(snapshot.generatedAt),
        scanSummary: buildScanSummary(snapshot),
        pricingSummary: `${snapshot.pricingModelSummary}; pricing reference: ${PRICING_SOURCE_URL}`,
        usageCards: buildUsageCards(snapshot),
        todayStats: buildTodayStats(snapshot),
        financialStats: buildFinancialStats(snapshot),
        defaultTimeframe: snapshot.settings.defaultChartTimeframe,
        trends: buildTrendModels(snapshot),
    };
}

function buildUsageCards(snapshot: UsageSnapshot) {
    const rate = snapshot.latestRate;
    if (!rate) {
        return [
            {
                label: '5-Hour Window',
                percentage: 0,
                status: 'Unavailable',
                color: 'green' as const,
                resetLabel: 'Waiting for token_count data',
                windowLabel: '300-minute window',
            },
            {
                label: '7-Day Rolling',
                percentage: 0,
                status: 'Unavailable',
                color: 'green' as const,
                resetLabel: 'Waiting for token_count data',
                windowLabel: '10080-minute window',
            },
        ];
    }

    return [
        toUsageCard(
            '5-Hour Window',
            rate.fiveHour.usedPercent,
            rate.fiveHour.resetsAt,
            rate.fiveHour.windowMinutes,
            snapshot.generatedAt
        ),
        toUsageCard(
            '7-Day Rolling',
            rate.weekly.usedPercent,
            rate.weekly.resetsAt,
            rate.weekly.windowMinutes,
            snapshot.generatedAt
        ),
    ];
}

function toUsageCard(
    label: string,
    percentage: number,
    resetsAt: number | undefined,
    windowMinutes: number,
    now: number
) {
    const color = getUsageStatusColor(percentage);
    return {
        label,
        percentage,
        status: getUsageStatusLabel(color),
        color,
        resetLabel: `Resets in ${formatResetTime(resetsAt, now)}`,
        windowLabel: `${windowMinutes}-minute window`,
    };
}

function buildTodayStats(snapshot: UsageSnapshot): DashboardMetricViewModel[] {
    return [
        {
            label: 'Total Tokens Today',
            value: formatNumber(snapshot.today.totalTokens),
            tone: 'accent',
            helper: 'Derived from token_count deltas logged today',
        },
        {
            label: 'Input Tokens',
            value: formatNumber(snapshot.today.inputTokens),
        },
        {
            label: 'Cached Tokens',
            value: formatNumber(snapshot.today.cachedInputTokens),
        },
        {
            label: 'Output Tokens',
            value: formatNumber(snapshot.today.outputTokens),
        },
        {
            label: 'API Equivalent Today',
            value: formatCurrency(snapshot.today.totalCost),
            helper: snapshot.pricingModelSummary,
        },
    ];
}

function buildFinancialStats(snapshot: UsageSnapshot): DashboardMetricViewModel[] {
    const trailing7DayCost = sumLastDays(snapshot.dailyTrend, 7);
    const projectedMonthly = (trailing7DayCost / 7) * 30;
    const actualPay = snapshot.actualMonthlySpend;
    const trailing30DayValue = snapshot.trailing30Days.totalCost;
    const valueDelta = actualPay === null ? null : trailing30DayValue - actualPay;

    return [
        {
            label: 'Actual Pay',
            value: formatCurrency(actualPay),
            helper: snapshot.plan === 'unknown' ? 'Set a subscription override if auto-detection is unavailable' : undefined,
        },
        {
            label: 'API Equivalent (30D)',
            value: formatCurrency(trailing30DayValue),
            tone: 'accent',
        },
        {
            label: 'Projected Monthly Spend',
            value: formatCurrency(projectedMonthly),
            helper: 'Trailing 7-day average extrapolated to 30 days',
        },
        {
            label: 'Value Delta',
            value: valueDelta === null ? 'Unknown' : formatCurrency(valueDelta),
            helper: valueDelta === null ? 'Needs a known plan price' : 'API equivalent minus subscription cost',
        },
    ];
}

function buildTrendModels(snapshot: UsageSnapshot): DashboardTrendViewModel[] {
    const trendSets: Array<{ id: ChartTimeframe; label: string; points: TrendPoint[] }> = [
        { id: '1D', label: '1 Day', points: snapshot.hourlyTrend },
        { id: '1W', label: '1 Week', points: snapshot.dailyTrend.slice(-7) },
        { id: '1M', label: '1 Month', points: snapshot.dailyTrend },
    ];

    return trendSets.map((trend) => ({
        id: trend.id,
        label: trend.label,
        totalLabel: formatCurrency(sumTrend(trend.points)),
        points: trend.points,
        path: buildSparklinePath(trend.points),
        yAxisLabels: buildYAxisLabels(trend.points),
    }));
}

function buildSparklinePath(points: TrendPoint[]): string {
    if (points.length === 0) {
        return '';
    }

    const maxValue = Math.max(...points.map((point) => point.value), 1);
    const width = CHART_WIDTH - CHART_PADDING * 2;
    const height = CHART_HEIGHT - CHART_PADDING * 2;

    return points
        .map((point, index) => {
            const x = CHART_PADDING + (index / Math.max(points.length - 1, 1)) * width;
            const y = CHART_PADDING + (1 - point.value / maxValue) * height;
            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${clamp(y, CHART_PADDING, CHART_HEIGHT - CHART_PADDING).toFixed(1)}`;
        })
        .join(' ');
}

function buildYAxisLabels(points: TrendPoint[]): string[] {
    const total = Math.max(...points.map((point) => point.value), 0);
    return [total, total / 2, 0].map((value) => formatCurrency(value));
}

function buildScanSummary(snapshot: UsageSnapshot): string {
    const modeLabel = snapshot.scanMode === 'deep' ? 'deep scan' : 'light refresh';
    return `Last ${modeLabel}; ${snapshot.filesScanned} file(s) considered; deep scan interval ${snapshot.settings.deepScanIntervalHours}h`;
}

function sumTrend(points: TrendPoint[]): number {
    return points.reduce((total, point) => total + point.value, 0);
}

function sumLastDays(points: TrendPoint[], days: number): number {
    return points.slice(-days).reduce((total, point) => total + point.value, 0);
}
