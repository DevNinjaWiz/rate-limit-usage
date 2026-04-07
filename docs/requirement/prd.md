# Product Requirements Document (PRD): Rate Limit Usage

## 1. Executive Summary
**Product Name:** Rate Limit Usage  
**Platform:** VS Code Extension  
**Target Audience:** Public (VS Code Marketplace)  
**Objective:** Provide passive, real-time monitoring of Codex usage limits and transparent cost analysis by comparing subscription value against OpenAI API pricing.

## 2. Problem Statement
Codex users often lack immediate visibility into their 5-hour and 7-day rate limits, leading to unexpected service interruptions. Furthermore, users cannot easily quantify the financial value of their $20 (Plus) or $200 (Pro) subscription compared to pay-as-you-go API costs.

## 3. Goals & Value Proposition
- **Real-time Visibility:** Passive monitoring of usage percentages in the status bar and dashboard.
- **Cost Transparency:** Breakdown of token usage (Input, Output, Cache) and "API Equivalent" cost calculation.
- **Value Analysis:** Compare actual subscription cost vs. what the usage would cost via OpenAI's API.

## 4. Functional Requirements

### 4.1 Usage Monitoring (Status Bar)
- Display the 5-hour window usage percentage.
- Display the 7-day weekly rolling window usage percentage.
- Color-coded indicators for critical thresholds (e.g., Green < 70%, Yellow 70-90%, Red > 90%).

### 4.2 Detailed Dashboard (Webview)
- **Progress Bars:** Visual representation of 5H and Weekly limits.
- **Today's Stats:**
    - Total Tokens consumed today.
    - Breakdown: Input, Output, and Cache tokens.
    - Total calculated cost for today based on detected models.
- **Financial Analysis:**
    - **Actual Pay:** Subscription cost ($20/mo or $200/mo).
    - **API Equivalent:** The cost of the same usage if billed at OpenAI API rates.
    - **Projected Monthly Spent:** Extrapolated cost based on current usage trends.
- **Trend Visualization:**
    - Line graph showing API-equivalent cost over time.
    - Toggleable timeframes: 1 Day, 1 Week, 1 Month.

### 4.3 Data Engine (Log Parsing)
- **Source:** Recursively scan `~/.codex/sessions/` for `.jsonl` files.
- **Frequency:** Default scan 1 time per day (high-depth), with 30-second light polling for the latest session.
- **Model Detection:** Identify specific models from `token_count` events and apply corresponding [OpenAI API Pricing](https://openai.com/api/pricing/).
- **Persistence:** No local database; all data is recalculated from logs on-demand (up to 1 month back).

### 4.4 User Settings
- **Scan Frequency:** Configurable interval for deep log scanning.
- **Pricing Model:** Preference for specific model pricing references.
- **Chart Timeframe:** Default timeframe for the dashboard line graph.
- **Subscription Override:** Manual selection of Plus ($20) or Pro ($200) if not detectable from logs.

## 5. Technical & Architectural Requirements
For detailed technical specifications, architectural patterns, and styling conventions, please refer to:
**[Architecture & Design Document](../solution/architecture.md)**

## 6. Success Metrics
- **User Engagement:** Frequency of dashboard views per user session.
- **Utility:** Reduced instances of users hitting "unexpected" rate limits.
- **Accuracy:** High correlation between extension-reported usage and actual server-side limits.
