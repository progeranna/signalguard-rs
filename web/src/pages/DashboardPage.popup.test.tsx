import type { PropsWithChildren } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SymbolPopupIdentity } from "@/features/dashboard/symbolPopup";
import type { SymbolPopupResourceState } from "@/features/dashboard/symbolPopupResource";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "@/features/dashboard/types";

const testState = vi.hoisted(() => ({
  identities: [] as Array<{
    mode: "demo" | "live";
    returnContext: "dashboard" | "symbols" | "anomalies";
    symbol: string;
  }>,
  mode: "demo" as "demo" | "live",
  resourceStatusByIdentity: new Map<string, "error" | "loading" | "success" | "unavailable">(),
}));

vi.mock("recharts", () => {
  function ChartStub({ children }: PropsWithChildren) {
    return <div>{children}</div>;
  }

  return {
    Area: ChartStub,
    AreaChart: ChartStub,
    CartesianGrid: ChartStub,
    ReferenceLine: ChartStub,
    ResponsiveContainer: ChartStub,
    Tooltip: ChartStub,
    XAxis: ChartStub,
    YAxis: ChartStub,
  };
});

vi.mock("@/features/dashboard/uiMode", () => ({
  useResolvedUiMode: () => testState.mode,
}));

vi.mock("@/features/dashboard/api", () => ({
  useCatalogDashboardSummaryQuery: (mode: UiMode) => ({
    data: summaryForMode(mode),
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useMarketTimelineQuery: () => ({
    data: { anomalies: [], points: [], symbol: "BTCUSDT" },
    error: null,
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/dashboard/symbolPopupResource", () => ({
  useSymbolPopupResource: (
    identity: SymbolPopupIdentity,
  ): SymbolPopupResourceState => {
    testState.identities.push(identity);
    const key = `${identity.mode}:${identity.symbol}`;
    const status = testState.resourceStatusByIdentity.get(key) ?? "success";
    const refetch = vi.fn(async () => undefined);

    if (status === "loading") {
      return { identity, refetch, status };
    }

    if (status === "error") {
      return {
        error: new Error(`${key} failed`),
        identity,
        refetch,
        status,
      };
    }

    if (status === "unavailable") {
      return { identity, refetch, status };
    }

    const summary = observedSymbol(
      identity.symbol,
      `${identity.mode.toUpperCase()}-${identity.symbol}-PRICE`,
    );

    return {
      identity,
      refetch,
      resource: {
        anomalies: [popupAnomaly(identity.symbol)],
        mode: identity.mode,
        summary,
        symbol: identity.symbol,
      },
      status,
    };
  },
}));

import { DashboardPage } from "./DashboardPage";

beforeEach(() => {
  testState.identities.splice(0);
  testState.mode = "demo";
  testState.resourceStatusByIdentity.clear();
  window.localStorage.clear();
  document.body.style.overflow = "";
});

function observedSymbol(symbol: string, price: string): DashboardSymbolSummary {
  return {
    health: {
      evaluated_at: "2026-07-20T10:00:00.000Z",
      recent_anomaly_count: 1,
      score: 95,
      status: "healthy",
    },
    state: {
      best_ask_price: price,
      best_bid_price: price,
      depth_sequence_gap_count: 0,
      last_event_age_ms: 100,
      last_event_time: "2026-07-20T10:00:00.000Z",
      last_trade_price: price,
      price_change_1m_pct: 0.1,
      spread_pct: 0.01,
      trades_per_minute: 12,
    },
    symbol,
  };
}

function popupAnomaly(symbol: string): DashboardAnomaly {
  return {
    anomaly_type: "spread_spike",
    created_at: "2026-07-20T10:00:00.000Z",
    event_time: "2026-07-20T10:00:00.000Z",
    id: symbol === "BTCUSDT"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000002",
    message: `${symbol} anomaly`,
    observed_value: 1,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}

function summaryForMode(mode: UiMode): DashboardSummary {
  const symbols = [
    observedSymbol("BTCUSDT", `${mode}-BTC-LIST`),
    observedSymbol("ETHUSDT", `${mode}-ETH-LIST`),
    observedSymbol("SOLUSDT", `${mode}-SOL-LIST`),
    observedSymbol("XRPUSDT", `${mode}-XRP-LIST`),
    observedSymbol("BNBUSDT", `${mode}-BNB-LIST`),
    observedSymbol("ADAUSDT", `${mode}-ADA-LIST`),
    observedSymbol("DOGEUSDT", `${mode}-DOGE-LIST`),
    observedSymbol("LTCUSDT", `${mode}-LTC-LIST`),
  ];
  const recentAnomalies = [
    popupAnomaly("BTCUSDT"),
    popupAnomaly("ETHUSDT"),
    ...Array.from({ length: 6 }, (_, index) => ({
      ...popupAnomaly(index % 2 === 0 ? "BTCUSDT" : "ETHUSDT"),
      id: `00000000-0000-4000-8000-0000000000${index + 10}`,
    })),
  ];

  return {
    pipeline: {
      cache_errors: 0,
      last_message_age_ms: 20,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: recentAnomalies,
    service: { service: "signalguard-rs", status: "ok" },
    symbols,
  };
}

function latestIdentity() {
  return testState.identities.at(-1);
}

function openDirectSymbol(symbol: "BTCUSDT" | "ETHUSDT") {
  fireEvent.click(
    screen.getAllByLabelText(`Open ${symbol} market detail`)[0]!,
  );
}

function openAllMarkets() {
  fireEvent.click(screen.getAllByRole("button", { name: "View all" })[0]!);
  return screen.getByRole("dialog", { name: "All markets" });
}

function openAllAnomalies() {
  fireEvent.click(screen.getAllByRole("button", { name: "View all" })[1]!);
  return screen.getByRole("dialog", { name: "All anomalies" });
}

describe("dashboard popup identity and return context", () => {
  it("opens a direct dashboard symbol with canonical dashboard context", () => {
    render(<DashboardPage />);

    openDirectSymbol("BTCUSDT");

    expect(latestIdentity()).toEqual({
      mode: "demo",
      returnContext: "dashboard",
      symbol: "BTCUSDT",
    });
    expect(screen.getByRole("dialog", { name: "BTCUSDT market details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Back to all/ })).not.toBeInTheDocument();
  });

  it("returns from an ETH popup to All markets", () => {
    render(<DashboardPage />);
    const allMarkets = openAllMarkets();

    fireEvent.click(
      within(allMarkets).getAllByLabelText("Open ETHUSDT market detail")[0]!,
    );

    expect(latestIdentity()).toEqual({
      mode: "demo",
      returnContext: "symbols",
      symbol: "ETHUSDT",
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to all markets" }));
    expect(screen.getByRole("dialog", { name: "All markets" })).toBeInTheDocument();
  });

  it("returns from a BTC popup to All anomalies", () => {
    render(<DashboardPage />);
    const allAnomalies = openAllAnomalies();

    fireEvent.click(
      within(allAnomalies).getAllByLabelText("Open BTCUSDT market detail")[0]!,
    );

    expect(latestIdentity()).toEqual({
      mode: "demo",
      returnContext: "anomalies",
      symbol: "BTCUSDT",
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to all anomalies" }));
    expect(screen.getByRole("dialog", { name: "All anomalies" })).toBeInTheDocument();
  });
});

describe("dashboard popup close behavior", () => {
  it("closes with Close and reopens without old content", () => {
    render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");
    expect(screen.getAllByText("DEMO-BTCUSDT-PRICE")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openDirectSymbol("ETHUSDT");
    expect(screen.getAllByText("DEMO-ETHUSDT-PRICE")).not.toHaveLength(0);
    expect(screen.queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();
    expect(latestIdentity()).toMatchObject({
      returnContext: "dashboard",
      symbol: "ETHUSDT",
    });
  });

  it("closes with Escape", () => {
    render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes through the backdrop but not through dialog interaction", () => {
    render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");
    const dialog = screen.getByRole("dialog", { name: "BTCUSDT market details" });

    fireEvent.mouseDown(dialog);
    expect(dialog).toBeInTheDocument();

    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("dashboard popup mode ownership", () => {
  it("detaches Demo content immediately when the mode changes to Live", () => {
    const view = render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");
    expect(screen.getAllByText("DEMO-BTCUSDT-PRICE")).not.toHaveLength(0);

    testState.mode = "live";
    testState.resourceStatusByIdentity.set("live:BTCUSDT", "loading");
    view.rerender(<DashboardPage />);

    expect(latestIdentity()).toEqual({
      mode: "live",
      returnContext: "dashboard",
      symbol: "BTCUSDT",
    });
    expect(screen.queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();
    expect(
      screen.getByText("Loading BTCUSDT market details for Live mode."),
    ).toBeInTheDocument();

    testState.resourceStatusByIdentity.set("live:BTCUSDT", "success");
    view.rerender(<DashboardPage />);
    expect(screen.getAllByText("LIVE-BTCUSDT-PRICE")).not.toHaveLength(0);
  });

  it("preserves All markets return context across a mode change", () => {
    const view = render(<DashboardPage />);
    const allMarkets = openAllMarkets();
    fireEvent.click(
      within(allMarkets).getAllByLabelText("Open ETHUSDT market detail")[0]!,
    );

    testState.mode = "live";
    testState.resourceStatusByIdentity.set("live:ETHUSDT", "unavailable");
    view.rerender(<DashboardPage />);

    expect(latestIdentity()).toEqual({
      mode: "live",
      returnContext: "symbols",
      symbol: "ETHUSDT",
    });
    expect(screen.getByText("ETHUSDT is unavailable in Live mode.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to all markets" }));
    expect(screen.getByRole("dialog", { name: "All markets" })).toBeInTheDocument();
  });

  it("keeps an error attached to the current mode and symbol", () => {
    testState.resourceStatusByIdentity.set("demo:ETHUSDT", "error");
    render(<DashboardPage />);
    openDirectSymbol("ETHUSDT");

    expect(screen.getByText("ETHUSDT market details unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The dashboard summary request did not complete successfully.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();
  });
});
