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

interface UsageData {
    codex: RateLimitData;
    claude: RateLimitData;
}

const DEFAULT_CLAUDE_LIMIT_5H_TOKENS = 46000;
const DEFAULT_CLAUDE_LIMIT_7D_TOKENS = 400000;

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

// --- Claude: sum output_tokens in time windows, compare to configured limits ---
function getClaudeUsage(): RateLimitData {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(projectsDir)) {
        return { fiveHourPct: 0, weeklyPct: 0 };
    }

    const config = vscode.workspace.getConfiguration('rateLimitUsage');
    const limit5h: number = config.get('claudeLimit5hTokens', DEFAULT_CLAUDE_LIMIT_5H_TOKENS);
    const limit7d: number = config.get('claudeLimit7dTokens', DEFAULT_CLAUDE_LIMIT_7D_TOKENS);

    const now = Date.now();
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let tokens5h = 0;
    let tokens7d = 0;

    function processFile(filePath: string) {
        try {
            const lines = fs.readFileSync(filePath, 'utf8').split('\n');
            for (const line of lines) {
                if (!line.trim()) { continue; }
                try {
                    const obj = JSON.parse(line);
                    if (obj.type === 'assistant' && obj.message?.usage && obj.timestamp) {
                        const ts = new Date(obj.timestamp).getTime();
                        const outputTokens: number = obj.message.usage.output_tokens ?? 0;
                        if (ts >= sevenDaysAgo) { tokens7d += outputTokens; }
                        if (ts >= fiveHoursAgo) { tokens5h += outputTokens; }
                    }
                } catch { /* skip malformed lines */ }
            }
        } catch { /* skip unreadable files */ }
    }

    function walk(dir: string) {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'subagents') {
                    walk(full);
                } else if (entry.name.endsWith('.jsonl')) {
                    processFile(full);
                }
            }
        } catch { /* ignore */ }
    }
    walk(projectsDir);

    return {
        fiveHourPct: Math.min(100, Math.round((tokens5h / limit5h) * 100)),
        weeklyPct: Math.min(100, Math.round((tokens7d / limit7d) * 100)),
    };
}

function readUsageData(): UsageData {
    return {
        codex: getCodexUsage(),
        claude: getClaudeUsage(),
    };
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
    if (pct >= 80) { return 'red'; }
    if (pct >= 50) { return 'yellow'; }
    return 'green';
}

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.tooltip = 'Click to view Usage Dashboard';
    statusBarItem.command = 'rateLimitUsage.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    function refresh() {
        const data = readUsageData();
        const c5 = data.codex.fiveHourPct;
        const cw = data.codex.weeklyPct;
        const cl5 = data.claude.fiveHourPct;
        const clw = data.claude.weeklyPct;
        // Status bar: "Codex 5H:12% W:78%  Claude 5H:5% W:20%"
        statusBarItem.text = `$(repl) Codex 5H:${c5}% W:${cw}%   Claude 5H:${cl5}% W:${clw}%`;
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

    public static createOrShow(_extensionUri: vscode.Uri, data: UsageData) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            DashboardPanel.currentPanel.update(data);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'rateLimitDashboard',
            'AI Rate Limit Dashboard',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );
        DashboardPanel.currentPanel = new DashboardPanel(panel, _extensionUri, data);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, data: UsageData) {
        this._panel = panel;
        this._htmlTemplate = fs.readFileSync(
            path.join(extensionUri.fsPath, 'dashboard.html'),
            'utf8'
        );
        this._panel.webview.html = this._getHtml(data);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public update(data: UsageData) {
        this._panel.webview.html = this._getHtml(data);
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }

    private _getHtml(data: UsageData): string {
        const { codex, claude } = data;
        const codex5hColor = getPctColor(codex.fiveHourPct);
        const codexWeeklyColor = getPctColor(codex.weeklyPct);
        const claude5hColor = getPctColor(claude.fiveHourPct);
        const claudeWeeklyColor = getPctColor(claude.weeklyPct);

        const codex5hReset = formatResetTime(codex.fiveHourResetsAt);
        const codexWeeklyReset = formatResetTime(codex.weeklyResetsAt);
        return this._htmlTemplate
            .replaceAll('{{updatedAt}}', new Date().toLocaleTimeString())
            .replaceAll('{{codex5hColor}}', codex5hColor)
            .replaceAll('{{codex5hPct}}', String(codex.fiveHourPct))
            .replaceAll('{{codex5hStatus}}', this._getStatusLabel(codex5hColor))
            .replaceAll('{{codex5hReset}}', codex5hReset)
            .replaceAll('{{codexWeeklyColor}}', codexWeeklyColor)
            .replaceAll('{{codexWeeklyPct}}', String(codex.weeklyPct))
            .replaceAll('{{codexWeeklyStatus}}', this._getStatusLabel(codexWeeklyColor))
            .replaceAll('{{codexWeeklyReset}}', codexWeeklyReset)
            .replaceAll('{{claude5hColor}}', claude5hColor)
            .replaceAll('{{claude5hPct}}', String(claude.fiveHourPct))
            .replaceAll('{{claude5hStatus}}', this._getStatusLabel(claude5hColor))
            .replaceAll('{{claudeWeeklyColor}}', claudeWeeklyColor)
            .replaceAll('{{claudeWeeklyPct}}', String(claude.weeklyPct))
            .replaceAll('{{claudeWeeklyStatus}}', this._getStatusLabel(claudeWeeklyColor));
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
