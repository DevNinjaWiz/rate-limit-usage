import { TrendPoint } from '../shared/types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function getLookbackStart(now: number, days: number): number {
    return now - days * DAY_MS;
}

export function startOfLocalDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function formatResetTime(resetsAt: number | undefined, nowMs: number): string {
    if (!resetsAt) {
        return 'Unavailable';
    }

    const diffSeconds = resetsAt - Math.floor(nowMs / 1000);
    if (diffSeconds <= 0) {
        return 'Now';
    }

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function toDayKey(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function toHourKey(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}`;
}

export function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
    });
}

export function buildHourlyLabels(now: number): TrendPoint[] {
    const points: TrendPoint[] = [];
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);

    for (let index = 23; index >= 0; index -= 1) {
        const timestamp = currentHour.getTime() - index * HOUR_MS;
        const label = new Date(timestamp).toLocaleTimeString([], {
            hour: 'numeric',
        });
        points.push({ timestamp, label, value: 0 });
    }

    return points;
}

export function buildDailyLabels(now: number, days: number): TrendPoint[] {
    const points: TrendPoint[] = [];
    const todayStart = startOfLocalDay(now);

    for (let index = days - 1; index >= 0; index -= 1) {
        const timestamp = todayStart - index * DAY_MS;
        const label = new Date(timestamp).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
        });
        points.push({ timestamp, label, value: 0 });
    }

    return points;
}

export function formatCurrency(value: number | null): string {
    if (value === null) {
        return 'Unknown';
    }

    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
}

export function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(Math.round(value));
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
