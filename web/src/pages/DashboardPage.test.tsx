import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);

function count(fragment: string): number {
  return source.split(fragment).length - 1;
}

describe("dashboard feature compositor", () => {
  it("imports and renders every accepted dashboard component", () => {
    for (const [component, modulePath] of [
      ["TimelinePanel", "@/features/dashboard/TimelinePanel"],
      ["MarketHealthDesktopTable", "@/features/dashboard/MarketHealthDesktopTable"],
      ["MarketHealthMobileCards", "@/features/dashboard/MarketHealthMobileCards"],
      ["RecentAnomaliesDesktopTable", "@/features/dashboard/RecentAnomaliesDesktopTable"],
      ["RecentAnomaliesMobileCards", "@/features/dashboard/RecentAnomaliesMobileCards"],
    ] as const) {
      expect(source).toContain(`import { ${component} } from "${modulePath}";`);
      expect(source).toContain(`<${component}`);
    }
  });

  it("uses each accepted preview builder exactly once in its preview owner", () => {
    expect(source).toContain(
      'import { buildMarketHealthPreview } from "@/features/dashboard/marketHealthPreviewModel";',
    );
    expect(source).toContain(
      'import { buildRecentAnomaliesPreview } from "@/features/dashboard/recentAnomaliesPreviewModel";',
    );
    expect(count("buildMarketHealthPreview(symbols)")).toBe(1);
    expect(count("buildRecentAnomaliesPreview(anomalies)")).toBe(1);
  });

  it("keeps the timeline query symbol, mode, and observed scoped", () => {
    expect(source).toContain(
      `useMarketTimelineQuery(\n    selectedMarket?.symbol ?? null,\n    selectedUiMode,\n    observed,\n  )`,
    );
  });

  it("wires every TimelinePanel prop from existing query and summary ownership", () => {
    for (const wiring of [
      "selectedMarket={selectedMarket}",
      "timelinePoints={timelineQuery.data?.points ?? []}",
      "timelineAnomalies={timelineQuery.data?.anomalies ?? []}",
      "isSummaryLoading={isLoading}",
      "isTimelineLoading={timelineQuery.isLoading}",
      "timelineErrorMessage={timelineErrorMessage}",
      "onRetryTimeline={() => void timelineQuery.refetch()}",
      "emptyAnchorMs={emptyAnchorMs}",
    ]) {
      expect(source).toContain(wiring);
    }
    expect(source).toContain(
      `const timelineErrorMessage = timelineQuery.isError\n    ? buildErrorMessage(timelineQuery.error)\n    : null;`,
    );
  });

  it("derives a finite deterministic empty anchor from query metadata", () => {
    expect(source).toContain(
      `const emptyAnchorMs = Number.isFinite(timelineQuery.dataUpdatedAt)\n    ? timelineQuery.dataUpdatedAt\n    : 0;`,
    );
    expect(source).not.toContain("Date.now()");
    expect(source).not.toMatch(/new Date\(\s*\)/);
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("setTimeout(");
    expect(source).not.toContain("Math.random(");
  });

  it("passes the same Market Health preview rows and callback to desktop and mobile", () => {
    expect(source).toMatch(
      /<MarketHealthDesktopTable\s+rows=\{preview\.rows\}\s+onOpenSymbolDetail=\{onOpenSymbolDetail\}\s+\/>/,
    );
    expect(source).toMatch(
      /<MarketHealthMobileCards\s+rows=\{preview\.rows\}\s+onOpenSymbolDetail=\{onOpenSymbolDetail\}\s+\/>/,
    );
  });

  it("passes the same Recent Anomalies preview rows and callback to desktop and mobile", () => {
    expect(source).toMatch(
      /<RecentAnomaliesDesktopTable\s+rows=\{preview\.rows\}\s+onOpenSymbolDetail=\{onOpenSymbolDetail\}\s+\/>/,
    );
    expect(source).toMatch(
      /<RecentAnomaliesMobileCards\s+rows=\{preview\.rows\}\s+onOpenSymbolDetail=\{onOpenSymbolDetail\}\s+\/>/,
    );
  });

  it("keeps preview-owned View all and empty-state decisions", () => {
    expect(count("preview.hasMore ? (")).toBe(2);
    expect(count("!preview.isEmpty ? (")).toBe(2);
    expect(source).toContain("No monitored markets available.");
    expect(source).toContain("No anomalies detected in the current summary.");
  });

  it("keeps equal shrink-safe preview columns and visible section copy", () => {
    expect(source).toContain(
      "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
    );
    expect(source).not.toContain("2xl:grid-cols-2");
    expect(source).toContain('title="Market Health"');
    expect(source).toContain(
      'subtitle="Current health signals for monitored markets."',
    );
    expect(source).toContain('title="Recent Anomalies"');
    expect(source).toContain(
      'subtitle="Latest data-quality events across monitored markets."',
    );
  });

  it("preserves all-markets, all-anomalies, and symbol-detail entry points", () => {
    expect(source).toContain("<AllSymbolHealthModal");
    expect(source).toContain("<AllAnomaliesModal");
    expect(source).toContain("<SymbolDetailModal");
    expect(source).toContain('openSymbolDetail(symbol, "dashboard")');
    expect(source).toContain('openSymbolDetail(symbol, "symbols")');
    expect(source).toContain('openSymbolDetail(symbol, "anomalies")');
  });

  it("keeps full raw collections in modal and detail workflows", () => {
    expect(source).toContain("const symbols = summary?.symbols ?? [];");
    expect(source).toContain("const anomalies = summary?.recent_anomalies ?? [];");
    expect(source).toContain("symbols={symbols}");
    expect(source).toContain("anomalies={anomalies}");
    expect(source).toContain("summary={summary}");
    expect(source).not.toContain("symbols={preview.rows}");
    expect(source).not.toContain("anomalies={preview.rows}");
  });

  it("removes direct chart and duplicate inline preview ownership", () => {
    expect(source).not.toContain('from "recharts"');
    for (const deadOwner of [
      "<AreaChart",
      "<ResponsiveContainer",
      "function TimelineTooltip",
      "function buildTimelineChartPoints",
      "function buildTimelinePriceDomain",
      "function buildTimelineTimeDomain",
      "function buildVisibleTimelineAnomalies",
      "function SymbolHealthTableRow(",
      "function AnomalyTableRow(",
      "function AnomalyCard(",
      "DASHBOARD_TABLE_PREVIEW_LIMIT",
    ]) {
      expect(source).not.toContain(deadOwner);
    }
  });

  it("does not copy accepted component or model implementations into the page", () => {
    expect(source).not.toContain("type MarketHealthPreviewRow");
    expect(source).not.toContain("type RecentAnomaliesPreviewRow");
    expect(source).not.toContain("MARKET_HEALTH_PREVIEW_LIMIT");
    expect(source).not.toContain("RECENT_ANOMALIES_PREVIEW_LIMIT");
    expect(source).not.toContain("normalizeTimelinePoints");
    expect(source).not.toContain("buildTimelineDomains");
  });

  it("keeps ticker ownership outside the dashboard page", () => {
    expect(source).not.toMatch(/import .*Ticker/);
    expect(source).not.toMatch(/function (?:Upper|Dashboard)?Ticker\(/);
    expect(source).not.toMatch(/const (?:Upper|Dashboard)?Ticker\s*=/);
  });
});
