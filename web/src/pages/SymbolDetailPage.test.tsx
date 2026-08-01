import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MarketDetailViewModel } from "@/features/dashboard/marketViewModel";
import type {
  SymbolMarketIdentity,
  SymbolMarketResourceData,
  SymbolMarketResourceState,
} from "@/features/dashboard/symbolMarketResource";
import type { SymbolDetailAnomaliesProps } from "@/features/dashboard/SymbolDetailAnomalies";
import type { SymbolDetailHeaderProps } from "@/features/dashboard/SymbolDetailHeader";
import type { SymbolDetailMetricsProps } from "@/features/dashboard/SymbolDetailMetrics";
import {
  getStoredSelectedSymbol,
  storeSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import {
  requireSymbolId,
  type SymbolId,
} from "@/features/dashboard/symbolId";
import type {
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "@/features/dashboard/types";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/SymbolDetailPage.tsx"),
  "utf8",
);

const testState = vi.hoisted(() => ({
  mode: "demo" as UiMode,
  routeSymbol: "BTCUSDT",
  catalogData: null as DashboardSummary | null,
  catalogIsLoading: false,
  resourceState: null as SymbolMarketResourceState | null,
  resourceIdentities: [] as SymbolMarketIdentity[],
  viewModel: null as MarketDetailViewModel | null,
  adapterCalls: [] as Array<{
    identity: Readonly<{ mode: UiMode; symbol: SymbolId }>;
    resource: SymbolMarketResourceData;
    viewModel: MarketDetailViewModel;
  }>,
  headerProps: [] as SymbolDetailHeaderProps[],
  metricsProps: [] as SymbolDetailMetricsProps[],
  anomalyProps: [] as SymbolDetailAnomaliesProps[],
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();

  return {
    ...actual,
    useParams: () => ({ symbol: testState.routeSymbol }),
  };
});

vi.mock("@/features/dashboard/uiMode", () => ({
  useResolvedUiMode: () => testState.mode,
}));

vi.mock("@/features/dashboard/api", () => ({
  useCatalogDashboardSummaryQuery: () => ({
    data: testState.catalogData,
    error: null,
    isError: false,
    isLoading: testState.catalogIsLoading,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/features/dashboard/symbolMarketResource", () => ({
  useSymbolMarketResource: (
    identity: SymbolMarketIdentity,
  ): SymbolMarketResourceState => {
    testState.resourceIdentities.push(identity);
    const state = testState.resourceState;

    if (!state) {
      throw new Error("Expected a configured symbol market resource state");
    }

    return { ...state, identity } as SymbolMarketResourceState;
  },
}));

vi.mock("@/features/dashboard/marketAdapters", () => ({
  adaptMarketResourceToViewModel: (
    resource: SymbolMarketResourceData,
    identity: Readonly<{ mode: UiMode; symbol: SymbolId }>,
  ): MarketDetailViewModel => {
    const viewModel = testState.viewModel;

    if (!viewModel) {
      throw new Error("Expected a configured market view model");
    }

    testState.adapterCalls.push({ identity, resource, viewModel });
    return viewModel;
  },
}));

vi.mock("@/features/dashboard/SymbolDetailHeader", () => ({
  SymbolDetailHeader: (props: SymbolDetailHeaderProps) => {
    testState.headerProps.push(props);
    return (
      <div
        data-testid="symbol-detail-header"
        data-source-label={props.sourceLabel}
      >
        {props.symbol}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/SymbolDetailMetrics", () => ({
  SymbolDetailMetrics: (props: SymbolDetailMetricsProps) => {
    testState.metricsProps.push(props);
    return (
      <div data-testid={`symbol-detail-metrics-${props.surface}`}>
        {props.viewModel.identity.symbol}
      </div>
    );
  },
}));

vi.mock("@/features/dashboard/SymbolDetailAnomalies", () => ({
  SymbolDetailAnomalies: (props: SymbolDetailAnomaliesProps) => {
    testState.anomalyProps.push(props);
    return <div data-testid="symbol-detail-anomalies">{props.symbol}</div>;
  },
}));

import { SymbolDetailPage } from "./SymbolDetailPage";

beforeEach(() => {
  testState.mode = "demo";
  testState.routeSymbol = "BTCUSDT";
  testState.catalogData = dashboardSummary("demo");
  testState.catalogIsLoading = false;
  testState.resourceIdentities.splice(0);
  testState.adapterCalls.splice(0);
  testState.headerProps.splice(0);
  testState.metricsProps.splice(0);
  testState.anomalyProps.splice(0);
  testState.viewModel = marketViewModel("demo", "BTCUSDT");
  testState.resourceState = successResourceState("demo", "BTCUSDT");
  window.localStorage.clear();
});

function symbolSummary(
  mode: UiMode,
  symbol: string,
  availability: DashboardSymbolSummary["availability"] = "observed",
): DashboardSymbolSummary {
  return {
    source: mode,
    availability,
    health: availability === "observed"
      ? {
          evaluated_at: "2026-07-20T10:00:00.000Z",
          recent_anomaly_count: 1,
          score: 95,
          status: "healthy",
        }
      : null,
    state: availability === "observed"
      ? {
          best_ask_price: 101,
          best_bid_price: 100,
          depth_sequence_gap_count: 0,
          last_event_age_ms: 100,
          last_event_time: "2026-07-20T10:00:00.000Z",
          last_trade_price: 100.5,
          price_change_1m_pct: 0.1,
          spread_pct: 0.01,
          trades_per_minute: 12,
        }
      : null,
    symbol,
  };
}

function dashboardSummary(mode: UiMode): DashboardSummary {
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
    recent_anomalies: [],
    service: { service: "signalguard-rs", status: "ok" },
    symbols: [
      symbolSummary(mode, "BTCUSDT"),
      symbolSummary(mode, "ETHUSDT"),
    ],
  };
}

function marketResource(mode: UiMode, symbol: string): SymbolMarketResourceData {
  const canonicalSymbol = requireSymbolId(symbol);

  return {
    anomalies: [],
    mode,
    summary: symbolSummary(mode, canonicalSymbol),
    symbol: canonicalSymbol,
  };
}

function marketViewModel(
  mode: UiMode,
  symbol: string,
  availability: DashboardSymbolSummary["availability"] = "observed",
): MarketDetailViewModel {
  const canonicalSymbol = requireSymbolId(symbol);
  const anomalies = Object.freeze([
    Object.freeze({
      id: `${mode}-${canonicalSymbol}-anomaly`,
      symbol: canonicalSymbol,
      type: `${mode} ${canonicalSymbol} anomaly`,
      severity: {
        key: "warning" as const,
        text: "Warning",
        tone: "warning" as const,
      },
      observed: { route: "1.5", popup: "1.500%" },
      threshold: { route: "1", popup: "1.000%" },
      detected: "1 min ago",
      detectedAt: "2026-07-20 10:00:00 UTC",
      context: `${mode} ${canonicalSymbol} context`,
      valueClassName: "text-amber-200",
    }),
  ]);

  return Object.freeze({
    identity: Object.freeze({ mode, symbol: canonicalSymbol }),
    source: mode,
    availability,
    status: Object.freeze({ text: "Healthy", tone: "healthy" as const }),
    healthScore: "95",
    stateAvailable: availability === "observed",
    metrics: Object.freeze({
      bestAsk: "101",
      bestBid: "100",
      depthGaps: "0",
      freshness: "100 ms",
      lastPrice: `${mode.toUpperCase()}-${canonicalSymbol}-PRICE`,
      lastEvent: "2026-07-20 10:00:00 UTC",
      anomalyCount: "1",
      priceMove: "0.1%",
      spread: "0.01%",
      tradesPerMinute: "12",
    }),
    anomalies,
  });
}

function resourceIdentity(mode: UiMode, symbol: SymbolId | null): SymbolMarketIdentity {
  return {
    mode,
    symbol,
    summary: symbol
      ? testState.catalogData?.symbols.find((entry) => entry.symbol === symbol)
      : undefined,
  };
}

function loadingResourceState(mode: UiMode, symbol: SymbolId | null) {
  const refetch = vi.fn(async () => undefined);
  const state: SymbolMarketResourceState = {
    identity: resourceIdentity(mode, symbol),
    refetch,
    status: "loading",
  };

  return { refetch, state };
}

function errorResourceState(mode: UiMode, symbol: SymbolId | null) {
  const refetch = vi.fn(async () => undefined);
  const state: SymbolMarketResourceState = {
    error: new Error(`${mode}:${symbol ?? "invalid"} failed`),
    identity: resourceIdentity(mode, symbol),
    refetch,
    status: "error",
  };

  return { refetch, state };
}

function unavailableResourceState(mode: UiMode, symbol: SymbolId | null) {
  const refetch = vi.fn(async () => undefined);
  const state: SymbolMarketResourceState = {
    identity: resourceIdentity(mode, symbol),
    refetch,
    status: "unavailable",
  };

  return { refetch, state };
}

function successResourceState(
  mode: UiMode,
  symbol: string,
): SymbolMarketResourceState {
  const canonicalSymbol = requireSymbolId(symbol);

  return {
    identity: resourceIdentity(mode, canonicalSymbol),
    refetch: vi.fn(async () => undefined),
    resource: marketResource(mode, canonicalSymbol),
    status: "success",
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/symbols/${testState.routeSymbol}`]}>
      <SymbolDetailPage />
    </MemoryRouter>,
  );
}

function normalizedRouteHeading(value: string): string {
  return value.trim().toUpperCase() || "UNKNOWN";
}

const resourceCases = [
  {
    name: "invalid route symbol",
    mode: "demo" as UiMode,
    routeSymbol: " ??? ",
    status: "unavailable" as const,
    canonicalSymbol: null,
  },
  {
    name: "loading",
    mode: "demo" as UiMode,
    routeSymbol: " btcusdt ",
    status: "loading" as const,
    canonicalSymbol: requireSymbolId("BTCUSDT"),
  },
  {
    name: "error",
    mode: "demo" as UiMode,
    routeSymbol: "BTCUSDT",
    status: "error" as const,
    canonicalSymbol: requireSymbolId("BTCUSDT"),
  },
  {
    name: "unavailable Live identity",
    mode: "live" as UiMode,
    routeSymbol: "BTCUSDT",
    status: "unavailable" as const,
    canonicalSymbol: requireSymbolId("BTCUSDT"),
  },
  {
    name: "success",
    mode: "demo" as UiMode,
    routeSymbol: " btcusdt ",
    status: "success" as const,
    canonicalSymbol: requireSymbolId("BTCUSDT"),
  },
] as const;

describe("symbol detail route resource behavior", () => {
  it.each(resourceCases)(
    "table-drives the $name state through the canonical resource identity",
    ({ mode, routeSymbol, status, canonicalSymbol }) => {
      testState.mode = mode;
      testState.routeSymbol = routeSymbol;
      testState.catalogData = dashboardSummary(mode);
      testState.viewModel =
        status === "unavailable" && mode === "live"
          ? marketViewModel("demo", "BTCUSDT")
          : marketViewModel(mode, canonicalSymbol ?? "BTCUSDT");

      let refetch: ReturnType<typeof vi.fn> | null = null;
      if (status === "loading") {
        const configured = loadingResourceState(mode, canonicalSymbol);
        refetch = configured.refetch;
        testState.resourceState = configured.state;
      } else if (status === "error") {
        const configured = errorResourceState(mode, canonicalSymbol);
        refetch = configured.refetch;
        testState.resourceState = configured.state;
      } else if (status === "unavailable") {
        const configured = unavailableResourceState(mode, canonicalSymbol);
        refetch = configured.refetch;
        testState.resourceState = configured.state;
      } else {
        testState.resourceState = successResourceState(mode, canonicalSymbol!);
      }

      const view = renderPage();
      const identity = testState.resourceIdentities.at(-1);
      const header = testState.headerProps.at(-1);

      expect(identity).toEqual({
        mode,
        symbol: canonicalSymbol,
        summary: canonicalSymbol
          ? testState.catalogData?.symbols.find(
              (entry) => entry.symbol === canonicalSymbol,
            )
          : undefined,
      });
      expect(header?.symbol).toBe(normalizedRouteHeading(routeSymbol));

      if (status === "loading") {
        expect(view.container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
        expect(testState.metricsProps).toHaveLength(0);
      } else if (status === "error") {
        expect(
          screen.getByRole("heading", { name: "Market detail unavailable" }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refetch).toHaveBeenCalledOnce();
      } else if (status === "unavailable") {
        expect(
          screen.getByRole("heading", {
            name: `${normalizedRouteHeading(routeSymbol)} market is not in the current summary`,
          }),
        ).toBeInTheDocument();
        expect(testState.adapterCalls).toHaveLength(0);
        expect(testState.metricsProps).toHaveLength(0);
        expect(testState.anomalyProps).toHaveLength(0);
        if (mode === "live") {
          expect(header?.sourceLabel).toBe("Live");
          expect(screen.queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();
        }
      } else {
        const adapterCall = testState.adapterCalls.at(-1);
        const viewModel = adapterCall?.viewModel;

        expect(adapterCall?.identity).toEqual({
          mode,
          symbol: canonicalSymbol,
        });
        expect(adapterCall?.resource).toBe(
          (testState.resourceState as Extract<SymbolMarketResourceState, { status: "success" }>).resource,
        );
        expect(testState.metricsProps.map((props) => props.surface)).toEqual([
          "route-strip",
          "route-state",
        ]);
        expect(testState.metricsProps[0]?.viewModel).toBe(viewModel);
        expect(testState.metricsProps[1]?.viewModel).toBe(viewModel);
        expect(testState.anomalyProps).toHaveLength(1);
        expect(testState.anomalyProps[0]?.variant).toBe("route");
        expect(testState.anomalyProps[0]?.symbol).toBe(
          normalizedRouteHeading(routeSymbol),
        );
        expect(testState.anomalyProps[0]?.anomalies).toBe(viewModel?.anomalies);
        expect("onOpenSymbolDetail" in testState.anomalyProps[0]!).toBe(false);
      }
    },
  );

  it("gives catalog loading precedence over an unavailable resource", () => {
    testState.routeSymbol = "BTCUSDT";
    testState.catalogIsLoading = true;
    testState.resourceState = unavailableResourceState(
      "demo",
      requireSymbolId("BTCUSDT"),
    ).state;

    const view = renderPage();

    expect(view.container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", {
        name: "BTCUSDT market is not in the current summary",
      }),
    ).not.toBeInTheDocument();
  });

  it("updates only the active mode selection through route links", async () => {
    storeSelectedSymbol("demo", "SOLUSDT");
    storeSelectedSymbol("live", "BTCUSDT");
    testState.mode = "live";
    testState.routeSymbol = "DOGEUSDT";
    testState.catalogData = dashboardSummary("live");
    testState.resourceState = unavailableResourceState(
      "live",
      requireSymbolId("DOGEUSDT"),
    ).state;

    renderPage();
    fireEvent.click(screen.getByRole("link", { name: "ETHUSDT" }));

    await waitFor(() => {
      expect(getStoredSelectedSymbol("live")).toBe("ETHUSDT");
    });
    expect(getStoredSelectedSymbol("demo")).toBe("SOLUSDT");
  });

  it("keeps direct route presentation ownership out of the page", () => {
    const imports = Array.from(
      source.matchAll(
        /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/g,
      ),
      (match) => match[1]!,
    );

    for (const specifier of imports) {
      expect(specifier).not.toMatch(
        /marketHealthPresentation|recentAnomaliesPresentation|HealthScore|StatusBadge|MarketHealthDesktopTable|MarketHealthMobileCards|RecentAnomaliesDesktopTable|RecentAnomaliesMobileCards/,
      );
    }
    expect(source).not.toMatch(/<table\b/);
  });
});