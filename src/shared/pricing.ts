import {
    PricingModel,
    PricingModelKey,
    PricingModelPreference,
    UsageTokens,
} from './types';

export const PRICING_SOURCE_URL = 'https://openai.com/api/pricing/';

export const PRICING_MODELS: Record<PricingModelKey, PricingModel> = {
    'gpt-5.4': {
        key: 'gpt-5.4',
        label: 'GPT-5.4',
        inputPerMillion: 2.5,
        cachedInputPerMillion: 0.25,
        outputPerMillion: 15,
    },
    'gpt-5.4-mini': {
        key: 'gpt-5.4-mini',
        label: 'GPT-5.4 mini',
        inputPerMillion: 0.75,
        cachedInputPerMillion: 0.075,
        outputPerMillion: 4.5,
    },
    'gpt-5.4-nano': {
        key: 'gpt-5.4-nano',
        label: 'GPT-5.4 nano',
        inputPerMillion: 0.2,
        cachedInputPerMillion: 0.02,
        outputPerMillion: 1.25,
    },
};

export function normalizePricingModelKey(modelName: string | undefined): PricingModelKey | undefined {
    if (!modelName) {
        return undefined;
    }

    const normalized = modelName.toLowerCase();
    if (normalized.includes('gpt-5.4-mini')) {
        return 'gpt-5.4-mini';
    }
    if (normalized.includes('gpt-5.4-nano')) {
        return 'gpt-5.4-nano';
    }
    if (normalized.includes('gpt-5.4')) {
        return 'gpt-5.4';
    }
    return undefined;
}

export function resolvePricingModel(
    detectedModel: string | undefined,
    preference: PricingModelPreference
): PricingModelKey {
    if (preference !== 'auto') {
        return preference;
    }

    return normalizePricingModelKey(detectedModel) ?? 'gpt-5.4';
}

export function calculateUsageCost(usage: UsageTokens, pricingModel: PricingModelKey): number {
    const pricing = PRICING_MODELS[pricingModel];
    return (
        (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
        (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
        (usage.outputTokens / 1_000_000) * pricing.outputPerMillion
    );
}

export function getPricingModelLabel(model: PricingModelKey): string {
    return PRICING_MODELS[model].label;
}
