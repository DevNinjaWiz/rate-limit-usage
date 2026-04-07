import { PricingModelKey, UsageAggregate, UsageStatusColor, UsageTokens } from '../shared/types';

export function createEmptyUsageAggregate(): UsageAggregate {
    return {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
        totalCost: 0,
    };
}

export function addUsage(target: UsageAggregate, usage: UsageTokens, cost: number): void {
    target.inputTokens += usage.inputTokens;
    target.cachedInputTokens += usage.cachedInputTokens;
    target.outputTokens += usage.outputTokens;
    target.reasoningOutputTokens += usage.reasoningOutputTokens;
    target.totalTokens += usage.totalTokens;
    target.totalCost += cost;
}

export function mergeUsage(...aggregates: UsageAggregate[]): UsageAggregate {
    const merged = createEmptyUsageAggregate();
    for (const aggregate of aggregates) {
        addUsage(merged, aggregate, aggregate.totalCost);
    }
    return merged;
}

export function cloneUsageAggregate(value: UsageAggregate): UsageAggregate {
    return {
        inputTokens: value.inputTokens,
        cachedInputTokens: value.cachedInputTokens,
        outputTokens: value.outputTokens,
        reasoningOutputTokens: value.reasoningOutputTokens,
        totalTokens: value.totalTokens,
        totalCost: value.totalCost,
    };
}

export function getUsageStatusColor(pct: number): UsageStatusColor {
    if (pct >= 90) {
        return 'red';
    }
    if (pct >= 70) {
        return 'yellow';
    }
    return 'green';
}

export function getUsageStatusLabel(color: UsageStatusColor): string {
    if (color === 'red') {
        return 'Critical';
    }
    if (color === 'yellow') {
        return 'Warning';
    }
    return 'Normal';
}

export function summarizeModelsByTokens(
    usageByModel: Partial<Record<PricingModelKey, number>>
): PricingModelKey[] {
    return Object.entries(usageByModel)
        .filter((entry): entry is [PricingModelKey, number] => typeof entry[1] === 'number')
        .sort((left, right) => right[1] - left[1])
        .map(([model]) => model);
}
