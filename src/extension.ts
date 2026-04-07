import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { buildDashboardState } from './services/dashboardState';
import { CodexUsageService } from './services/codexUsageService';
import { ChartTimeframe, DashboardState, ScanSettings } from './shared/types';
import { getUsageStatusColor } from './utils/usage';

const STATUS_BAR_WARNING_FOREGROUND = '#f2cc60';
const STATUS_BAR_ERROR_FOREGROUND = '#f48771';
const DASHBOARD_COMMAND = 'rateLimitUsage.showDashboard';
const DASHBOARD_TITLE = 'Rate Limit Usage Dashboard';

export function activate(context: vscode.ExtensionContext) {
    let usageService = new CodexUsageService();
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.tooltip = 'Click to view the Rate Limit Usage dashboard';
    statusBarItem.command = DASHBOARD_COMMAND;
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const refresh = () => {
        try {
            const snapshot = usageService.getSnapshot(readSettings());
            const dashboardState = buildDashboardState(snapshot);
            const usageCards = dashboardState.usageCards;
            statusBarItem.text = `$(pulse) 5H: ${usageCards[0].percentage}% Weekly: ${usageCards[1].percentage}%`;
            statusBarItem.color = getStatusBarColor([
                usageCards[0].percentage,
                usageCards[1].percentage,
            ]);
            statusBarItem.tooltip = `${dashboardState.pricingSummary}\n${dashboardState.scanSummary}`;

            if (DashboardPanel.currentPanel) {
                DashboardPanel.currentPanel.update(dashboardState);
            }
        } catch (error) {
            statusBarItem.text = '$(warning) Rate Limit Usage unavailable';
            statusBarItem.color = STATUS_BAR_ERROR_FOREGROUND;
            statusBarItem.tooltip = error instanceof Error ? error.message : 'Unknown error';
        }
    };

    refresh();
    const timer = setInterval(refresh, 30 * 1000);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration('rateLimitUsage')) {
                return;
            }

            usageService = new CodexUsageService();
            refresh();
        })
    );

    const disposable = vscode.commands.registerCommand(DASHBOARD_COMMAND, () => {
        const snapshot = usageService.getSnapshot(readSettings());
        const dashboardState = buildDashboardState(snapshot);
        DashboardPanel.createOrShow(context.extensionUri, dashboardState);
    });

    context.subscriptions.push(disposable);
}

function readSettings(): ScanSettings {
    const config = vscode.workspace.getConfiguration('rateLimitUsage');

    return {
        deepScanIntervalHours: clampNumber(config.get<number>('deepScanIntervalHours', 24), 1, 168),
        pricingModelPreference: config.get<ScanSettings['pricingModelPreference']>('pricingModelPreference', 'auto'),
        defaultChartTimeframe: config.get<ChartTimeframe>('defaultChartTimeframe', '1W'),
        subscriptionOverride: config.get<ScanSettings['subscriptionOverride']>('subscriptionOverride', 'auto'),
    };
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getStatusBarColor(percentages: number[]): string | undefined {
    const maxPct = Math.max(...percentages);
    const color = getUsageStatusColor(maxPct);
    if (color === 'red') {
        return STATUS_BAR_ERROR_FOREGROUND;
    }
    if (color === 'yellow') {
        return STATUS_BAR_WARNING_FOREGROUND;
    }
    return undefined;
}

class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly htmlTemplate: string;
    private readonly disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, dashboardState: DashboardState) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(column);
            DashboardPanel.currentPanel.update(dashboardState);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'rateLimitDashboard',
            DASHBOARD_TITLE,
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, dashboardState);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, dashboardState: DashboardState) {
        this.panel = panel;
        this.htmlTemplate = fs.readFileSync(resolveDashboardTemplatePath(extensionUri.fsPath), 'utf8');
        this.panel.webview.html = this.renderHtml(dashboardState);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public update(dashboardState: DashboardState) {
        this.panel.webview.html = this.renderHtml(dashboardState);
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }

    private renderHtml(dashboardState: DashboardState): string {
        const stateJson = JSON.stringify(dashboardState).replace(/</g, '\\u003c');
        return this.htmlTemplate.replace('{{dashboardState}}', stateJson);
    }
}

function resolveDashboardTemplatePath(extensionRoot: string): string {
    const distPath = path.join(extensionRoot, 'dist', 'dashboard.html');
    if (fs.existsSync(distPath)) {
        return distPath;
    }

    return path.join(extensionRoot, 'src', 'dashboard.html');
}

export function deactivate() {
    // No-op: VS Code disposes subscriptions registered during activation.
}
