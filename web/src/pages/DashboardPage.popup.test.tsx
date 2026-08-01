import type { PropsWithChildren } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MarketDetailViewModel } from "@/features/dashboard/marketViewModel";
import {
  getStoredSelectedSymbol,
  storeSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import type { SymbolPopupIdentity } from "@/features/dashboard/symbolPopup";
import type { SymbolPopupResourceState } from "@/features/dashboard/symbolPopupResource";
import type { SymbolDetailAnomaliesProps } from "@/features/dashboard/SymbolDetailAnomalies";
import type { SymbolDetailHeaderProps } from "@/features/dashboard/SymbolDetailHeader";
import type { SymbolDetailMetricsProps } from "@/features/dashboard/SymbolDetailMetrics";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "@/features/dashboard/types";

type PopupResourceRefetch = SymbolPopupResourceState["refetch"];

const testState = vi.hoisted(() => ({
  adapterCalls: [] as Array<{
    identity: Readonly<{ mode: UiMode; symbol: string }>;
    resource: unknown;
    viewModel: MarketDetailViewModel;
  }>,
  anomalyProps: [] as SymbolDetailAnomaliesProps[],
  headerProps: [] as SymbolDetailHeaderProps[],
  identities: [] as Array<{
    mode: "demo" | "live";
    returnContext: "dashboard" | "symbols" | "anomalies";
    symbol: string;
  }>,
  metricsProps: [] as SymbolDetailMetricsProps[],
  mode: "demo" as "demo" | "live",
  nonObserved: false,
  resourceRefetchByIdentity: new Map<string, PopupResourceRefetch>(),
  timelineEnabled: [] as boolean[],
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
  useMarketTimelineQuery: (_symbol: string | null, _mode: UiMode, enabled = true) => {
    testState.timelineEnabled.push(enabled);
    return {
      data: { anomalies: [], points: [], symbol: "BTCUSDT" },
      error: null,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("@/features/dashboard/marketAdapters", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/dashboard/marketAdapters")
  >();

  return {
    ...actual,
    adaptMarketResourceToViewModel: (
      ...args: Parameters<typeof actual.adaptMarketResourceToViewModel>
    ) => {
      const viewModel = actual.adaptMarketResourceToViewModel(...args);
      const identity = args[1];
      if (!identity) {
        throw new Error("Expected market resource adapter identity");
      }
      testState.adapterCalls.push({
        identity,
        resource: args[0],
        viewModel,
      });
      return viewModel;
    },
  };
});

vi.mock("@/features/dashboard/SymbolDetailHeader", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/dashboard/SymbolDetailHeader")
  >();

  return {
    ...actual,
    SymbolDetailHeader: (props: SymbolDetailHeaderProps) => {
      const Component = actual.SymbolDetailHeader;
      testState.headerProps.push(props);
      return <Component {...props} />;
    },
  };
});

vi.mock("@/features/dashboard/SymbolDetailMetrics", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/dashboard/SymbolDetailMetrics")
  >();

  return {
    ...actual,
    SymbolDetailMetrics: (props: SymbolDetailMetricsProps) => {
      const Component = actual.SymbolDetailMetrics;
      testState.metricsProps.push(props);
      return <Component {...props} />;
    },
  };
});

vi.mock("@/features/dashboard/SymbolDetailAnomalies", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/dashboard/SymbolDetailAnomalies")
  >();

  return {
    ...actual,
    SymbolDetailAnomalies: (props: SymbolDetailAnomaliesProps) => {
      const Component = actual.SymbolDetailAnomalies;
      testState.anomalyProps.push(props);
      return <Component {...props} />;
    },
  };
});

vi.mock("@/features/dashboard/symbolPopupResource", () => ({
  useSymbolPopupResource: (
    identity: SymbolPopupIdentity,
  ): SymbolPopupResourceState => {
    testState.identities.push(identity);
    const key = `${identity.mode}:${identity.symbol}`;
    const status = testState.resourceStatusByIdentity.get(key) ?? "success";
    let refetch = testState.resourceRefetchByIdentity.get(key);
    if (!refetch) {
      const createdRefetch: PopupResourceRefetch = vi.fn(
        async (): Promise<unknown> => undefined,
      );
      refetch = createdRefetch;
      testState.resourceRefetchByIdentity.set(key, refetch);
    }

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

    const summary = testState.nonObserved ? {
      source: identity.mode,
      availability: "configured" as const,
      health: null,
      state: null,
      symbol: identity.symbol,
    } : observedSymbol(
      identity.symbol,
      `${identity.mode.toUpperCase()}-${identity.symbol}-PRICE`,
      identity.mode,
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
  testState.adapterCalls.splice(0);
  testState.anomalyProps.splice(0);
  testState.headerProps.splice(0);
  testState.identities.splice(0);
  testState.metricsProps.splice(0);
  testState.mode = "demo";
  testState.nonObserved = false;
  testState.resourceRefetchByIdentity.clear();
  testState.timelineEnabled.splice(0);
  testState.resourceStatusByIdentity.clear();
  window.localStorage.clear();
  document.body.style.overflow = "";
});

function observedSymbol(symbol: string, price: string, source: UiMode = "demo"): DashboardSymbolSummary {
  return {
    source,
    availability: "observed",
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
    observedSymbol("BTCUSDT", `${mode}-BTC-LIST`, mode),
    observedSymbol("ETHUSDT", `${mode}-ETH-LIST`, mode),
    observedSymbol("SOLUSDT", `${mode}-SOL-LIST`, mode),
    observedSymbol("XRPUSDT", `${mode}-XRP-LIST`, mode),
    observedSymbol("BNBUSDT", `${mode}-BNB-LIST`, mode),
    observedSymbol("ADAUSDT", `${mode}-ADA-LIST`, mode),
    observedSymbol("DOGEUSDT", `${mode}-DOGE-LIST`, mode),
    observedSymbol("LTCUSDT", `${mode}-LTC-LIST`, mode),
  ];
  if (mode === "live" && testState.nonObserved) {
    symbols[0] = {
      source: "live",
      availability: "configured",
      health: null,
      state: null,
      symbol: "BTCUSDT",
    };
  }
  const recentAnomalies = [
    popupAnomaly("BTCUSDT"),
    popupAnomaly("ETHUSDT"),
    ...Array.from({ length: 6 }, (_, index) => ({
      ...popupAnomaly(index % 2 === 0 ? "BTCUSDT" : "ETHUSDT"),
      id: `00000000-0000-4000-8000-0000000000${index + 10}`,
    })),
  ];

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

describe("dashboard popup state and presentation contracts", () => {
  it.each(["loading", "error", "unavailable", "success"] as const)(
    "renders the controlled %s state for the canonical identity",
    (status) => {
      testState.resourceStatusByIdentity.set("demo:ETHUSDT", status);
      render(<DashboardPage />);
      openDirectSymbol("ETHUSDT");

      expect(latestIdentity()).toEqual({
        mode: "demo",
        returnContext: "dashboard",
        symbol: "ETHUSDT",
      });

      const dialog = screen.getByRole("dialog", { name: "ETHUSDT market details" });
      if (status === "loading") {
        expect(
          within(dialog).getByText("Loading ETHUSDT market details for Demo mode."),
        ).toBeInTheDocument();
      } else if (status === "error") {
        expect(
          within(dialog).getByText("ETHUSDT market details unavailable"),
        ).toBeInTheDocument();
      } else if (status === "unavailable") {
        expect(
          within(dialog).getByText("ETHUSDT is unavailable in Demo mode."),
        ).toBeInTheDocument();
      } else {
        expect(within(dialog).getAllByText("DEMO-ETHUSDT-PRICE")).not.toHaveLength(0);
      }
    },
  );

  it("passes one shared view model and raw symbol identity to popup sections", () => {
    render(<DashboardPage />);
    openDirectSymbol("ETHUSDT");

    const adapterCall = testState.adapterCalls.at(-1);
    const headerProps = testState.headerProps.at(-1);
    const metricsProps = testState.metricsProps.at(-1);
    const anomalyProps = testState.anomalyProps.at(-1);

    expect(adapterCall?.identity).toEqual({ mode: "demo", symbol: "ETHUSDT" });
    expect(headerProps?.variant).toBe("popup");
    expect(headerProps?.symbol).toBe("ETHUSDT");
    expect(metricsProps?.surface).toBe("popup");
    expect(metricsProps?.viewModel).toBe(adapterCall?.viewModel);
    expect(anomalyProps?.variant).toBe("popup");
    expect(anomalyProps?.symbol).toBe("ETHUSDT");
    expect(anomalyProps?.anomalies).toBe(adapterCall?.viewModel.anomalies);

    const dialog = screen.getByRole("dialog", { name: "ETHUSDT market details" });
    const anomalyButton = within(dialog).getByRole("button", {
      name: "Open ETHUSDT market detail",
    });
    expect(anomalyButton).toBeInstanceOf(HTMLButtonElement);
    expect(anomalyButton).toHaveAttribute("type", "button");
    anomalyButton.focus();
    expect(anomalyButton).toHaveFocus();
    fireEvent.click(anomalyButton);
    expect(latestIdentity()).toEqual({
      mode: "demo",
      returnContext: "dashboard",
      symbol: "ETHUSDT",
    });
  });

  it("retries only the current mode and symbol resource", () => {
    testState.resourceStatusByIdentity.set("demo:BTCUSDT", "error");
    const view = render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(testState.resourceRefetchByIdentity.get("demo:BTCUSDT")).toHaveBeenCalledOnce();

    testState.mode = "live";
    testState.resourceStatusByIdentity.set("live:BTCUSDT", "error");
    view.rerender(<DashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(testState.resourceRefetchByIdentity.get("live:BTCUSDT")).toHaveBeenCalledOnce();
    expect(testState.resourceRefetchByIdentity.get("demo:BTCUSDT")).toHaveBeenCalledOnce();
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
  it("uses the exact empty state and disables timeline for a configured Live market", () => {
    testState.mode = "live";
    testState.nonObserved = true;
    render(<DashboardPage />);

    expect(testState.timelineEnabled).toContain(false);
    openDirectSymbol("BTCUSDT");
    const dialog = screen.getByRole("dialog", { name: "BTCUSDT market details" });
    expect(within(dialog).getByText("Configured for Live; Live ingestion is not active.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Health")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Price")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Recent market anomalies")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();
  });

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

  it("ignores late old-symbol and old-mode resolutions", () => {
    testState.resourceStatusByIdentity.set("demo:BTCUSDT", "loading");
    const view = render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");
    expect(
      screen.getByText("Loading BTCUSDT market details for Demo mode."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    testState.resourceStatusByIdentity.set("demo:ETHUSDT", "loading");
    openDirectSymbol("ETHUSDT");
    testState.resourceStatusByIdentity.set("demo:BTCUSDT", "success");
    view.rerender(<DashboardPage />);

    expect(
      screen.getByText("Loading ETHUSDT market details for Demo mode."),
    ).toBeInTheDocument();
    expect(screen.queryByText("DEMO-BTCUSDT-PRICE")).not.toBeInTheDocument();

    testState.mode = "live";
    testState.resourceStatusByIdentity.set("live:ETHUSDT", "loading");
    view.rerender(<DashboardPage />);
    testState.resourceStatusByIdentity.set("demo:ETHUSDT", "success");
    view.rerender(<DashboardPage />);

    expect(latestIdentity()).toEqual({
      mode: "live",
      returnContext: "dashboard",
      symbol: "ETHUSDT",
    });
    expect(
      screen.getByText("Loading ETHUSDT market details for Live mode."),
    ).toBeInTheDocument();
    expect(screen.queryByText("DEMO-ETHUSDT-PRICE")).not.toBeInTheDocument();

    testState.resourceStatusByIdentity.set("live:ETHUSDT", "success");
    view.rerender(<DashboardPage />);
    expect(screen.getAllByText("LIVE-ETHUSDT-PRICE")).not.toHaveLength(0);
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

  it("updates only the active mode selected-symbol key through popup interactions", () => {
    storeSelectedSymbol("demo", "SOLUSDT");
    storeSelectedSymbol("live", "XRPUSDT");

    const view = render(<DashboardPage />);
    openDirectSymbol("BTCUSDT");
    expect(getStoredSelectedSymbol("demo")).toBe("BTCUSDT");
    expect(getStoredSelectedSymbol("live")).toBe("XRPUSDT");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    testState.mode = "live";
    view.rerender(<DashboardPage />);
    openDirectSymbol("ETHUSDT");

    expect(getStoredSelectedSymbol("live")).toBe("ETHUSDT");
    expect(getStoredSelectedSymbol("demo")).toBe("BTCUSDT");
  });
});