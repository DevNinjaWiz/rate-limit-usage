import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface RateLimitData {
    fiveHourPct: number;
    weeklyPct: number;
    fiveHourResetsAt?: number; // unix seconds
    weeklyResetsAt?: number;   // unix seconds
}

const STATUS_BAR_WARNING_FOREGROUND = '#f2cc60';
const STATUS_BAR_ERROR_FOREGROUND = '#f48771';

// --- Codex: read rate_limits from latest session's last token_count event ---
function getCodexUsage(): RateLimitData {
    const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        return { fiveHourPct: 0, weeklyPct: 0 };
    }

    // Walk year/month/day subdirs to find all .jsonl files, sorted by mtime desc
    const files: { file: string; mtime: number }[] = [];
    function walk(dir: string) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.name.endsWith('.jsonl')) {
                    files.push({ file: full, mtime: fs.statSync(full).mtimeMs });
                }
            }
        } catch { /* ignore permission errors */ }
    }
    walk(sessionsDir);
    files.sort((a, b) => b.mtime - a.mtime);

    // Search most-recent files for the last token_count event
    for (const { file } of files.slice(0, 10)) {
        try {
            const lines = fs.readFileSync(file, 'utf8').split('\n');
            let lastRateLimits: any = null;
            for (const line of lines) {
                if (!line.trim()) { continue; }
                try {
                    const obj = JSON.parse(line);
                    if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
                        lastRateLimits = obj.payload.rate_limits;
                    }
                } catch { /* skip malformed lines */ }
            }
            if (lastRateLimits) {
                return {
                    fiveHourPct: Math.round(lastRateLimits.primary?.used_percent ?? 0),
                    weeklyPct: Math.round(lastRateLimits.secondary?.used_percent ?? 0),
                    fiveHourResetsAt: lastRateLimits.primary?.resets_at,
                    weeklyResetsAt: lastRateLimits.secondary?.resets_at,
                };
            }
        } catch { /* skip unreadable files */ }
    }
    return { fiveHourPct: 0, weeklyPct: 0 };
}

function readUsageData(): RateLimitData {
    return getCodexUsage();
}

function formatResetTime(resetsAt: number | undefined): string {
    if (!resetsAt) { return '?'; }
    const now = Math.floor(Date.now() / 1000);
    const diffSecs = resetsAt - now;
    if (diffSecs <= 0) { return 'now'; }
    const h = Math.floor(diffSecs / 3600);
    const m = Math.floor((diffSecs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getPctColor(pct: number): string {
    if (pct >= 90) { return 'red'; }
    if (pct >= 70) { return 'yellow'; }
    return 'green';
}

function getStatusBarColor(pcts: number[]): string | undefined {
    const max = Math.max(...pcts);
    if (max >= 90) { return STATUS_BAR_ERROR_FOREGROUND; }
    if (max >= 70) { return STATUS_BAR_WARNING_FOREGROUND; }
    return undefined;
}

function formatStatusBarValue(pct: number): string {
    return `${pct}%`;
}

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.tooltip = 'Click to view Codex Usage Dashboard';
    statusBarItem.command = 'rateLimitUsage.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    function refresh() {
        const data = readUsageData();
        const c5 = data.fiveHourPct;
        const cw = data.weeklyPct;
        statusBarItem.text = `$(repl) 5H: ${formatStatusBarValue(c5)} Weekly: ${formatStatusBarValue(cw)}`;
        statusBarItem.color = getStatusBarColor([c5, cw]);
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.update(data);
        }
    }

    refresh();
    const timer = setInterval(refresh, 30 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });

    const disposable = vscode.commands.registerCommand('rateLimitUsage.showDashboard', () => {
        const data = readUsageData();
        DashboardPanel.createOrShow(context.extensionUri, data);
    });
    context.subscriptions.push(disposable);
}

class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _htmlTemplate: string;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(_extensionUri: vscode.Uri, data: RateLimitData) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel.update(data);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'rateLimitDashboard',
            'Codex Usage Dashboard',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );
        DashboardPanel.currentPanel = new DashboardPanel(panel, _extensionUri, data);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, data: RateLimitData) {
        this._panel = panel;
        this._htmlTemplate = fs.readFileSync(
            path.join(extensionUri.fsPath, 'src', 'dashboard.html'),
            'utf8'
        );
        this._panel.webview.html = this._getHtml(data);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public update(data: RateLimitData) {
        this._panel.webview.html = this._getHtml(data);
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private _getHtml(data: RateLimitData): string {
        const codex5hColor = getPctColor(data.fiveHourPct);
        const codexWeeklyColor = getPctColor(data.weeklyPct);

        const codex5hReset = formatResetTime(data.fiveHourResetsAt);
        const codexWeeklyReset = formatResetTime(data.weeklyResetsAt);
        const dashboardState = JSON.stringify({
            updatedAt: new Date().toLocaleTimeString(),
            codex5h: {
                pct: data.fiveHourPct,
                color: codex5hColor,
                status: this._getStatusLabel(codex5hColor),
                reset: codex5hReset,
            },
            codexWeekly: {
                pct: data.weeklyPct,
                color: codexWeeklyColor,
                status: this._getStatusLabel(codexWeeklyColor),
                reset: codexWeeklyReset,
            },
        }).replace(/</g, '\\u003c');

        return this._htmlTemplate
            .replace('{{dashboardState}}', dashboardState);
    }

    private _getStatusLabel(color: string): string {
        if (color === 'red') {
            return 'Critical';
        }
        if (color === 'yellow') {
            return 'Warning';
        }
        return 'Normal';
    }
}
