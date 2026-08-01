import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "@/features/dashboard/types";

const testState = vi.hoisted(() => ({
  anomalyBuilderCalls: [] as Array<readonly unknown[]>,
  anomalyPreview: null as null | {
    allRows: readonly { id: string; symbol: string }[];
    rows: readonly { id: string; symbol: string }[];
    hasMore: boolean;
    isEmpty: boolean;
  },
  marketBuilderCalls: [] as Array<readonly unknown[]>,
  marketDesktopProps: [] as Array<{
    rows: readonly { symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }>,
  marketMobileProps: [] as Array<{
    rows: readonly { symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }>,
  marketPreview: null as null | {
    allRows: readonly { key: string; symbol: string }[];
    rows: readonly { key: string; symbol: string }[];
    hasMore: boolean;
    isEmpty: boolean;
  },
  mode: "demo" as "demo" | "live",
  popupIdentities: [] as Array<{
    mode: "demo" | "live";
    returnContext: "dashboard" | "symbols" | "anomalies";
    symbol: string;
  }>,
  recentDesktopProps: [] as Array<{
    rows: readonly { id: string; symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }>,
  recentMobileProps: [] as Array<{
    rows: readonly { id: string; symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }>,
  selectedSymbol: "BTCUSDT" as string | null,
  storedSelections: [] as Array<{ mode: "demo" | "live"; symbol: string }>,
  summaryCalls: [] as Array<"demo" | "live">,
  summaryQuery: null as null | Record<string, unknown>,
  timelineCalls: [] as Array<{
    symbol: string | null;
    mode: "demo" | "live";
    enabled: boolean;
  }>,
  timelineProps: [] as Array<{
    selectedMarket: { symbol: string; availability: string } | null;
    timelinePoints: readonly unknown[];
    timelineAnomalies: readonly unknown[];
    isSummaryLoading: boolean;
    isTimelineLoading: boolean;
    timelineErrorMessage: string | null;
    onRetryTimeline: () => void;
    emptyAnchorMs: number;
  }>,
  timelineQuery: null as null | Record<string, unknown>,
}));

vi.mock("@/features/dashboard/uiMode", () => ({
  useResolvedUiMode: () => testState.mode,
}));

vi.mock("@/features/dashboard/selectedSymbol", () => ({
  normalizeSelectedSymbol: (value: string | null | undefined) => {
    const normalized = value?.trim().toUpperCase() ?? "";
    return normalized.length > 0 ? normalized : null;
  },
  storeSelectedSymbol: (mode: "demo" | "live", symbol: string) => {
    testState.storedSelections.push({ mode, symbol });
  },
  useSelectedSymbol: () => ({ selectedSymbol: testState.selectedSymbol }),
}));

vi.mock("@/features/dashboard/api", () => ({
  useCatalogDashboardSummaryQuery: (mode: "demo" | "live") => {
    testState.summaryCalls.push(mode);
    return testState.summaryQuery;
  },
  useMarketTimelineQuery: (
    symbol: string | null,
    mode: "demo" | "live",
    enabled = true,
  ) => {
    testState.timelineCalls.push({ symbol, mode, enabled });
    return testState.timelineQuery;
  },
}));

vi.mock("@/features/dashboard/marketHealthPreviewModel", () => ({
  buildMarketHealthPreview: (symbols: readonly unknown[]) => {
    testState.marketBuilderCalls.push(symbols);
    return testState.marketPreview;
  },
}));

vi.mock("@/features/dashboard/recentAnomaliesPreviewModel", () => ({
  buildRecentAnomaliesPreview: (anomalies: readonly unknown[]) => {
    testState.anomalyBuilderCalls.push(anomalies);
    return testState.anomalyPreview;
  },
}));

vi.mock("@/features/dashboard/MarketHealthDesktopTable", () => ({
  MarketHealthDesktopTable: ({
    rows,
    onOpenSymbolDetail,
  }: {
    rows: readonly { symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }) => {
    testState.marketDesktopProps.push({ rows, onOpenSymbolDetail });
    return (
      <div data-testid="market-health-desktop">
        {rows.map((row) => (
          <button
            key={`desktop:${row.symbol}`}
            type="button"
            onClick={() => onOpenSymbolDetail(row.symbol)}
          >
            {row.symbol}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/MarketHealthMobileCards", () => ({
  MarketHealthMobileCards: ({
    rows,
    onOpenSymbolDetail,
  }: {
    rows: readonly { symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }) => {
    testState.marketMobileProps.push({ rows, onOpenSymbolDetail });
    return (
      <div data-testid="market-health-mobile">
        {rows.map((row) => (
          <button
            key={`mobile:${row.symbol}`}
            type="button"
            onClick={() => onOpenSymbolDetail(row.symbol)}
          >
            {row.symbol}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/RecentAnomaliesDesktopTable", () => ({
  RecentAnomaliesDesktopTable: ({
    rows,
    onOpenSymbolDetail,
  }: {
    rows: readonly { id: string; symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }) => {
    testState.recentDesktopProps.push({ rows, onOpenSymbolDetail });
    return (
      <div data-testid="recent-anomalies-desktop">
        {rows.map((row) => (
          <button
            key={`desktop:${row.id}`}
            type="button"
            onClick={() => onOpenSymbolDetail(row.symbol)}
          >
            {row.symbol}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/RecentAnomaliesMobileCards", () => ({
  RecentAnomaliesMobileCards: ({
    rows,
    onOpenSymbolDetail,
  }: {
    rows: readonly { id: string; symbol: string }[];
    onOpenSymbolDetail: (symbol: string) => void;
  }) => {
    testState.recentMobileProps.push({ rows, onOpenSymbolDetail });
    return (
      <div data-testid="recent-anomalies-mobile">
        {rows.map((row) => (
          <button
            key={`mobile:${row.id}`}
            type="button"
            onClick={() => onOpenSymbolDetail(row.symbol)}
          >
            {row.symbol}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/TimelinePanel", () => ({
  TimelinePanel: (props: {
    selectedMarket: { symbol: string; availability: string } | null;
    timelinePoints: readonly unknown[];
    timelineAnomalies: readonly unknown[];
    isSummaryLoading: boolean;
    isTimelineLoading: boolean;
    timelineErrorMessage: string | null;
    onRetryTimeline: () => void;
    emptyAnchorMs: number;
  }) => {
    testState.timelineProps.push(props);
    const state = props.isSummaryLoading
      ? "summary-loading"
      : props.timelineErrorMessage !== null
        ? "error"
        : props.isTimelineLoading
          ? "loading"
          : props.timelinePoints.length === 0
            ? "empty"
            : "success";

    return (
      <div data-testid="timeline-panel" data-state={state}>
        <span>{props.selectedMarket?.symbol ?? "none"}</span>
        <button type="button" onClick={props.onRetryTimeline}>
          Retry timeline recorder
        </button>
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/symbolPopupResource", () => ({
  useSymbolPopupResource: (identity: {
    mode: "demo" | "live";
    returnContext: "dashboard" | "symbols" | "anomalies";
    symbol: string;
  }) => {
    testState.popupIdentities.push(identity);
    return { identity, refetch: vi.fn(), status: "unavailable" as const };
  },
}));

import { DashboardPage } from "./DashboardPage";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);

function count(fragment: string): number {
  return source.split(fragment).length - 1;
}

function observedSymbol(
  symbol: string,
  sourceMode: UiMode = "demo",
  availability: DashboardSymbolSummary["availability"] = "observed",
): DashboardSymbolSummary {
  return {
    source: sourceMode,
    availability,
    health:
      availability === "observed"
        ? {
            evaluated_at: "2026-07-20T10:00:00.000Z",
            recent_anomaly_count: 1,
            score: 95,
            status: "healthy",
          }
        : null,
    state:
      availability === "observed"
        ? {
            best_ask_price: "101.00",
            best_bid_price: "100.00",
            depth_sequence_gap_count: 0,
            last_event_age_ms: 100,
            last_event_time: "2026-07-20T10:00:00.000Z",
            last_trade_price: "100.50",
            price_change_1m_pct: 0.1,
            spread_pct: 0.01,
            trades_per_minute: 12,
          }
        : null,
    symbol,
  };
}

function dashboardAnomaly(symbol: string, index = 1): DashboardAnomaly {
  return {
    anomaly_type: "spread_spike",
    created_at: `2026-07-20T10:00:0${index}.000Z`,
    event_time: `2026-07-20T10:00:0${index}.000Z`,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    message: `${symbol} anomaly ${index}`,
    observed_value: 1,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}

function summary(
  mode: UiMode = "demo",
  symbols: DashboardSymbolSummary[] = [observedSymbol("BTCUSDT", mode)],
  anomalies: DashboardAnomaly[] = [dashboardAnomaly("BTCUSDT")],
): DashboardSummary {
  return {
    source: mode,
    pipeline: {
      cache_errors: 0,
      last_message_age_ms: 20,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: anomalies,
    service: { service: "signalguard-rs", status: "ok" },
    symbols,
  };
}

function marketRows(symbols: readonly DashboardSymbolSummary[]) {
  return symbols.map((entry) => ({
    key: `${entry.source}:${entry.symbol}`,
    symbol: entry.symbol,
  }));
}

function anomalyRows(anomalies: readonly DashboardAnomaly[]) {
  return anomalies.map((entry) => ({ id: entry.id, symbol: entry.symbol }));
}

function setSummaryQuery(
  data: DashboardSummary | null,
  isLoading = false,
  isError = false,
) {
  testState.summaryQuery = {
    data: data ?? undefined,
    error: isError ? new Error("summary failed") : null,
    isError,
    isLoading,
    refetch: vi.fn(),
  };
}

function setTimelineQuery({
  points = [{ timestamp: "2026-07-20T10:00:00.000Z", price: "100" }],
  anomalies = [],
  dataUpdatedAt = 123_456,
  isLoading = false,
  isError = false,
  refetch = vi.fn(),
}: {
  points?: readonly unknown[];
  anomalies?: readonly unknown[];
  dataUpdatedAt?: number;
  isLoading?: boolean;
  isError?: boolean;
  refetch?: ReturnType<typeof vi.fn>;
} = {}) {
  testState.timelineQuery = {
    data: isError || isLoading ? undefined : { points, anomalies },
    dataUpdatedAt,
    error: isError ? new Error("timeline failed") : null,
    isError,
    isLoading,
    refetch,
  };
}

function setPreviews(currentSummary: DashboardSummary) {
  const allMarketRows = marketRows(currentSummary.symbols);
  const allAnomalyRows = anomalyRows(currentSummary.recent_anomalies);
  testState.marketPreview = {
    allRows: allMarketRows,
    rows: allMarketRows.slice(0, 7),
    hasMore: allMarketRows.length > 7,
    isEmpty: allMarketRows.length === 0,
  };
  testState.anomalyPreview = {
    allRows: allAnomalyRows,
    rows: allAnomalyRows.slice(0, 7),
    hasMore: allAnomalyRows.length > 7,
    isEmpty: allAnomalyRows.length === 0,
  };
}

function latestTimelineProps() {
  const props = testState.timelineProps.at(-1);
  if (!props) {
    throw new Error("TimelinePanel recorder was not called");
  }
  return props;
}

beforeEach(() => {
  testState.anomalyBuilderCalls.splice(0);
  testState.marketBuilderCalls.splice(0);
  testState.marketDesktopProps.splice(0);
  testState.marketMobileProps.splice(0);
  testState.popupIdentities.splice(0);
  testState.recentDesktopProps.splice(0);
  testState.recentMobileProps.splice(0);
  testState.storedSelections.splice(0);
  testState.summaryCalls.splice(0);
  testState.timelineCalls.splice(0);
  testState.timelineProps.splice(0);
  testState.mode = "demo";
  testState.selectedSymbol = "BTCUSDT";
  const currentSummary = summary();
  setSummaryQuery(currentSummary);
  setTimelineQuery();
  setPreviews(currentSummary);
  window.localStorage.clear();
  document.body.style.overflow = "";
});

describe("dashboard behavior-level composition", () => {
  it("delegates accepted preview rows to both responsive surfaces and preserves callback identity", () => {
    const currentSummary = (testState.summaryQuery?.data ?? null) as DashboardSummary;
    const marketPreviewRows = testState.marketPreview!.rows;
    const anomalyPreviewRows = testState.anomalyPreview!.rows;

    render(<DashboardPage />);

    expect(testState.summaryCalls).toEqual(["demo"]);
    expect(testState.marketBuilderCalls.at(-1)).toBe(currentSummary.symbols);
    expect(testState.anomalyBuilderCalls.at(-1)).toBe(
      currentSummary.recent_anomalies,
    );
    expect(testState.marketDesktopProps.at(-1)?.rows).toBe(marketPreviewRows);
    expect(testState.marketMobileProps.at(-1)?.rows).toBe(marketPreviewRows);
    expect(testState.recentDesktopProps.at(-1)?.rows).toBe(anomalyPreviewRows);
    expect(testState.recentMobileProps.at(-1)?.rows).toBe(anomalyPreviewRows);

    fireEvent.click(
      within(screen.getByTestId("market-health-desktop")).getByRole("button", {
        name: "BTCUSDT",
      }),
    );

    expect(testState.popupIdentities.at(-1)).toEqual({
      mode: "demo",
      returnContext: "dashboard",
      symbol: "BTCUSDT",
    });
    expect(testState.storedSelections).toEqual([
      { mode: "demo", symbol: "BTCUSDT" },
    ]);
  });

  it("preserves summary-loading, empty, and success composition", () => {
    setSummaryQuery(null, true);
    testState.marketPreview = {
      allRows: [],
      rows: [],
      hasMore: false,
      isEmpty: true,
    };
    testState.anomalyPreview = {
      allRows: [],
      rows: [],
      hasMore: false,
      isEmpty: true,
    };
    const loading = render(<DashboardPage />);

    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "summary-loading",
    );
    expect(screen.queryByTestId("market-health-desktop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recent-anomalies-desktop")).not.toBeInTheDocument();
    loading.unmount();

    const emptySummary = summary("demo", [], []);
    setSummaryQuery(emptySummary);
    setPreviews(emptySummary);
    const empty = render(<DashboardPage />);

    expect(screen.getByText("No monitored markets available.")).toBeInTheDocument();
    expect(
      screen.getByText("No anomalies detected in the current summary."),
    ).toBeInTheDocument();
    empty.unmount();

    const successSummary = summary();
    setSummaryQuery(successSummary);
    setPreviews(successSummary);
    render(<DashboardPage />);
    expect(screen.getByTestId("market-health-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("recent-anomalies-desktop")).toBeInTheDocument();
  });

  it("uses preview rows in preview surfaces and full raw collections in modal workflows", () => {
    const symbols = Object.freeze(
      Array.from({ length: 9 }, (_, index) =>
        Object.freeze(observedSymbol(`ASSET${index}USDT`)),
      ),
    ) as unknown as DashboardSymbolSummary[];
    const anomalies = Object.freeze(
      Array.from({ length: 9 }, (_, index) =>
        Object.freeze(dashboardAnomaly(`ASSET${index}USDT`, index + 1)),
      ),
    ) as unknown as DashboardAnomaly[];
    const currentSummary = summary("demo", symbols, anomalies);
    const before = JSON.stringify(currentSummary);
    setSummaryQuery(currentSummary);
    setPreviews(currentSummary);

    render(<DashboardPage />);

    expect(testState.marketBuilderCalls.at(-1)).toBe(symbols);
    expect(testState.anomalyBuilderCalls.at(-1)).toBe(anomalies);
    expect(testState.marketDesktopProps.at(-1)?.rows).toBe(
      testState.marketPreview?.rows,
    );
    expect(testState.recentDesktopProps.at(-1)?.rows).toBe(
      testState.anomalyPreview?.rows,
    );
    expect(screen.queryByText("ASSET8USDT")).not.toBeInTheDocument();

    const viewAllButtons = screen.getAllByRole("button", { name: "View all" });
    fireEvent.click(viewAllButtons[0]!);
    const allMarkets = screen.getByRole("dialog", { name: "All markets" });
    expect(within(allMarkets).getAllByText("ASSET8USDT").length).toBeGreaterThan(0);
    fireEvent.click(within(allMarkets).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getAllByRole("button", { name: "View all" })[1]!);
    const allAnomalies = screen.getByRole("dialog", { name: "All anomalies" });
    expect(within(allAnomalies).getAllByText("ASSET8USDT").length).toBeGreaterThan(0);
    expect(JSON.stringify(currentSummary)).toBe(before);
  });
});

describe("dashboard timeline ownership", () => {
  it.each([
    ["demo", "observed", true],
    ["live", "observed", true],
    ["live", "configured", false],
    ["live", "awaiting", false],
    ["live", "unavailable", false],
  ] as const)(
    "passes %s %s identity and enabled=%s to the public timeline boundary",
    (mode, availability, enabled) => {
      const selected = observedSymbol("ETHUSDT", mode, availability);
      const currentSummary = summary(mode, [selected], []);
      testState.mode = mode;
      testState.selectedSymbol = "ETHUSDT";
      setSummaryQuery(currentSummary);
      setPreviews(currentSummary);
      setTimelineQuery();

      render(<DashboardPage />);

      expect(testState.timelineCalls.at(-1)).toEqual({
        symbol: "ETHUSDT",
        mode,
        enabled,
      });
      expect(latestTimelineProps().selectedMarket).toBe(selected);
      expect(latestTimelineProps().emptyAnchorMs).toBe(123_456);
    },
  );

  it("detaches old identity data and preserves loading, error, empty, success, anchor, and retry ownership", () => {
    const firstSummary = summary("demo", [observedSymbol("BTCUSDT", "demo")], []);
    setSummaryQuery(firstSummary);
    setPreviews(firstSummary);
    setTimelineQuery({ points: [{ timestamp: "old", price: "1" }] });
    const view = render(<DashboardPage />);

    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "success",
    );
    expect(latestTimelineProps().selectedMarket?.symbol).toBe("BTCUSDT");

    const retry = vi.fn();
    const secondSummary = summary("live", [observedSymbol("ETHUSDT", "live")], []);
    testState.mode = "live";
    testState.selectedSymbol = "ETHUSDT";
    setSummaryQuery(secondSummary);
    setPreviews(secondSummary);
    setTimelineQuery({ dataUpdatedAt: Number.POSITIVE_INFINITY, isError: true, refetch: retry });
    view.rerender(<DashboardPage />);

    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(latestTimelineProps().selectedMarket?.symbol).toBe("ETHUSDT");
    expect(latestTimelineProps().timelinePoints).toEqual([]);
    expect(latestTimelineProps().timelineErrorMessage).not.toBeNull();
    expect(latestTimelineProps().emptyAnchorMs).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry timeline recorder" }));
    expect(retry).toHaveBeenCalledOnce();

    setTimelineQuery({ isLoading: true });
    view.rerender(<DashboardPage />);
    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "loading",
    );

    setTimelineQuery({ points: [] });
    view.rerender(<DashboardPage />);
    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "empty",
    );

    setTimelineQuery({ points: [{ timestamp: "new", price: "2" }] });
    view.rerender(<DashboardPage />);
    expect(screen.getByTestId("timeline-panel")).toHaveAttribute(
      "data-state",
      "success",
    );
    expect(latestTimelineProps().selectedMarket?.symbol).toBe("ETHUSDT");
  });
});

describe("dashboard retained source contracts", () => {
  it("uses canonical market-health presentation owners in full-market surfaces", () => {
    expect(source).toContain(
      'import { HealthScore } from "@/features/dashboard/HealthScore";',
    );
    expect(source).toContain(
      `import {
  availabilityMessage,
  formatOptionalAge,
  formatOptionalCompact,
  formatTickerPercent,
  formatTickerPrice,
  marketStatusLabel,
  statusLabel,
} from "@/features/dashboard/marketHealthPresentation";`,
    );
    expect(source).toContain("<HealthScore score={score} status={symbol.health?.status} />");
    expect(source).toContain(
      "<HealthScore\n            score={symbol.health?.score ?? null}\n            status={symbol.health?.status}\n          />",
    );
    expect(source).toContain(
      "marketStatusLabel(symbol.availability, symbol.health?.status)",
    );
    for (const helper of [
      "HealthScore",
      "healthScoreTone",
      "healthScoreTextClass",
      "healthScoreBarClass",
      "formatTickerPrice",
      "formatTickerPercent",
      "formatOptionalCompact",
      "formatOptionalAge",
      "statusLabel",
      "availabilityMessage",
      "marketStatusLabel",
    ]) {
      expect(source).not.toContain(`function ${helper}(`);
    }
  });

  it("uses the canonical anomaly presentation owner without page-local helper copies", () => {
    expect(source).toContain(
      `import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyType,
  formatAnomalyValue,
  severityBadgeClass,
} from "@/features/dashboard/recentAnomaliesPresentation";`,
    );
    expect(source).toContain("function SeverityBadge(");

    for (const helper of [
      "severityBadgeClass",
      "anomalyValueClass",
      "formatAnomalyType",
      "formatAnomalyTime",
      "formatAnomalyValue",
      "formatDurationValue",
      "formatIntegerValue",
      "formatNumericValue",
    ]) {
      expect(source).not.toContain(`function ${helper}(`);
    }

    expect(
      count("formatAnomalyTime(anomaly.event_time || anomaly.created_at)"),
    ).toBe(2);
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

  it("wires the accepted shared sections into popup success presentation", () => {
    expect(source).toContain(
      `<div className="space-y-6" data-testid="symbol-popup-success">`,
    );
    expect(source).toContain(
      `<SymbolDetailHeader
        variant="popup"
        symbol={viewModel.identity.symbol}
        statusTone={viewModel.status.tone}
        statusText={viewModel.status.text}
        sourceLabel={viewModel.source === "live" ? "Live" : "Demo"}
      />`,
    );
    expect(source).toContain(
      `<SymbolDetailMetrics
        surface="popup"
        viewModel={viewModel}
      />`,
    );
    expect(source).toContain(
      `<SymbolDetailAnomalies
          variant="popup"
          symbol={viewModel.identity.symbol}
          anomalies={viewModel.anomalies}
          onOpenSymbolDetail={onOpenSymbolDetail}
        />`,
    );
    expect(source).not.toContain("function SymbolDetailMetric");
    expect(source).not.toContain("function SymbolDetailAnomalyRow");
    expect(source).not.toContain("function SymbolDetailAnomalyCard");
  });

  it("keeps popup resource and modal lifecycle ownership in SymbolDetailModal", () => {
    expect(source).toContain("function SymbolDetailModal(");
    expect(source).toContain("const resourceState = useSymbolPopupResource(");
    expect(source).toContain("resourceState.resource.mode !== identity.mode");
    expect(source).toContain("resourceState.resource.symbol !== identity.symbol");
    expect(source).toContain('resourceState.status === "loading"');
    expect(source).toContain('resourceState.status === "error"');
    expect(source).toContain('onRetry={() => void resourceState.refetch()}');
    expect(source).toContain('resourceState.status === "unavailable"');
    expect(source).toContain("adaptMarketResourceToViewModel(resourceState.resource");
    expect(source).toContain(
      'data-popup-identity={`${identity.mode}:${identity.symbol}:${identity.returnContext}`}',
    );
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
