import { createElement, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dashboardSummaryQueryKeyForMode,
  marketTimelineQueryKey,
  runtimeModeQueryKey,
  useCatalogDashboardSummaryQuery,
  useMarketTimelineQuery,
} from "./api";
import { getMarketCatalogAvailability } from "./marketCatalog";
import { isDashboardSymbolPlaceholder } from "./marketOrder";
import {
  selectedSymbolStorageKey,
  useSelectedSymbol,
} from "./selectedSymbol";
import { createSymbolPopupIdentity, type SymbolPopupReturnContext } from "./symbolPopup";
import { useSymbolPopupResource } from "./symbolPopupResource";
import type { UiMode } from "./types";
import {
  createJsonResponse,
  installControlledFetch,
  type ControlledFetch,
  type RequestIdentity,
} from "@/test/deferredFetch";
import {
  matrixRuntimeMode,
  matrixSentinel,
  matrixSummary,
  matrixTimeline,
  type MatrixSymbol,
} from "@/test/marketFixtures";

const queryClients: QueryClient[] = [];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  queryClients.splice(0).forEach((queryClient) => queryClient.clear());
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  queryClients.push(queryClient);
  return queryClient;
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { children, client: queryClient });
  };
}

function MarketIdentityProbe({ mode }: { mode: UiMode }) {
  const summaryQuery = useCatalogDashboardSummaryQuery(mode);
  const symbols = summaryQuery.data?.symbols ?? [];
  const availableSymbols = symbols.map((entry) => entry.symbol);
  const { selectedSymbol, setSelectedSymbol } = useSelectedSymbol(
    mode,
    availableSymbols,
  );
  const selectedSummary =
    symbols.find((entry) => entry.symbol === selectedSymbol) ?? null;
  const selectedAnomaly =
    summaryQuery.data?.recent_anomalies.find(
      (entry) => entry.symbol === selectedSymbol,
    ) ?? null;
  const timelineQuery = useMarketTimelineQuery(selectedSymbol, mode);
  const availability = selectedSummary
    ? getMarketCatalogAvailability(selectedSummary)
    : null;
  const awaitingData = selectedSummary
    ? isDashboardSymbolPlaceholder(selectedSummary)
    : true;

  return (
    <section data-testid="active-cell">
      <span data-testid="active-mode">{mode}</span>
      <span data-testid="header-symbol">{selectedSymbol ?? "NONE"}</span>
      <span data-testid="selected-symbol">{selectedSymbol ?? "NONE"}</span>
      <span data-testid="summary-row-symbol">{selectedSummary?.symbol ?? "NONE"}</span>
      <span data-testid="summary-price">
        {selectedSummary?.state?.last_trade_price ?? "NO-SUMMARY-PRICE"}
      </span>
      <span data-testid="summary-anomaly">
        {selectedAnomaly?.message ?? "NO-SUMMARY-ANOMALY"}
      </span>
      <span data-testid="timeline-symbol">{timelineQuery.data?.symbol ?? "NONE"}</span>
      <span data-testid="timeline-price">
        {timelineQuery.data?.points[0]?.price ?? "NO-TIMELINE-PRICE"}
      </span>
      <span data-testid="timeline-anomaly">
        {timelineQuery.data?.anomalies[0]?.message ?? "NO-TIMELINE-ANOMALY"}
      </span>
      <span data-testid="availability">{availability ?? "absent"}</span>
      <span data-testid="empty-state">
        {awaitingData ? "Waiting for market data" : "Observed market data"}
      </span>
      <span data-testid="catalog">{availableSymbols.join(",")}</span>
      <button type="button" onClick={() => setSelectedSymbol("BTCUSDT")}>Select BTC</button>
      <button type="button" onClick={() => setSelectedSymbol("ETHUSDT")}>Select ETH</button>
    </section>
  );
}

function PopupProbe({
  mode,
  returnContext = "dashboard",
  symbol,
}: {
  mode: UiMode;
  returnContext?: SymbolPopupReturnContext;
  symbol: MatrixSymbol;
}) {
  const identity = createSymbolPopupIdentity(mode, symbol, returnContext);

  if (!identity) {
    throw new TypeError(`invalid popup identity: ${mode}/${symbol}`);
  }

  const resource = useSymbolPopupResource(identity);

  return (
    <section data-testid="popup-probe">
      <h2>{identity.symbol} market details</h2>
      <span data-testid="popup-mode">{identity.mode}</span>
      <span data-testid="popup-symbol">{identity.symbol}</span>
      <span data-testid="popup-return-context">{identity.returnContext}</span>
      <span data-testid="popup-status">{resource.status}</span>
      <span data-testid="popup-price">
        {resource.status === "success"
          ? resource.resource.summary.state?.last_trade_price ?? "NO-POPUP-PRICE"
          : "NO-POPUP-RESOURCE"}
      </span>
      <span data-testid="popup-anomaly">
        {resource.status === "success"
          ? resource.resource.anomalies[0]?.message ?? "NO-POPUP-ANOMALY"
          : "NO-POPUP-RESOURCE"}
      </span>
    </section>
  );
}

function MatrixCell({ mode, symbol }: { mode: UiMode; symbol: MatrixSymbol }) {
  return (
    <>
      <MarketIdentityProbe mode={mode} />
      <PopupProbe mode={mode} symbol={symbol} />
    </>
  );
}

async function waitForRequest(
  controlled: ControlledFetch,
  identity: RequestIdentity,
) {
  await waitFor(() => expect(controlled.find(identity)).toBeDefined());
  const request = controlled.find(identity);

  if (!request) {
    throw new Error(`request missing after wait: ${JSON.stringify(identity)}`);
  }

  return request;
}

async function resolveRequest(
  controlled: ControlledFetch,
  identity: RequestIdentity,
  payload: unknown,
) {
  await act(async () => {
    controlled.resolve(identity, payload);
    await Promise.resolve();
  });
}

async function resolveSummary(
  controlled: ControlledFetch,
  mode: UiMode,
  observed: readonly MatrixSymbol[] = ["BTCUSDT", "ETHUSDT"],
) {
  if (mode === "live") {
    await waitForRequest(controlled, { endpoint: "runtime" });
    await resolveRequest(
      controlled,
      { endpoint: "runtime" },
      matrixRuntimeMode(["BTCUSDT", "ETHUSDT"]),
    );
  }

  await waitForRequest(controlled, { endpoint: "summary", mode });
  await resolveRequest(
    controlled,
    { endpoint: "summary", mode },
    matrixSummary(mode, observed),
  );
}

async function resolveTimeline(
  controlled: ControlledFetch,
  mode: UiMode,
  symbol: MatrixSymbol,
) {
  const identity = { endpoint: "timeline", mode, symbol } as const;
  await waitForRequest(controlled, identity);
  await resolveRequest(controlled, identity, matrixTimeline(mode, symbol));
}

async function expectActiveCell(mode: UiMode, symbol: MatrixSymbol) {
  const sentinel = matrixSentinel(mode, symbol);
  const otherMode: UiMode = mode === "demo" ? "live" : "demo";
  const otherSymbol: MatrixSymbol = symbol === "BTCUSDT" ? "ETHUSDT" : "BTCUSDT";

  await waitFor(() => {
    const activeRoot = screen.getByTestId("active-cell");
    const active = within(activeRoot);

    expect(active.getByTestId("active-mode")).toHaveTextContent(mode);
    expect(active.getByTestId("header-symbol")).toHaveTextContent(symbol);
    expect(active.getByTestId("selected-symbol")).toHaveTextContent(symbol);
    expect(active.getByTestId("summary-row-symbol")).toHaveTextContent(symbol);
    expect(active.getByTestId("summary-price")).toHaveTextContent(sentinel.summaryPrice);
    expect(active.getByTestId("summary-anomaly")).toHaveTextContent(sentinel.anomaly);
    expect(active.getByTestId("timeline-symbol")).toHaveTextContent(symbol);
    expect(active.getByTestId("timeline-price")).toHaveTextContent(sentinel.timelinePrice);
    expect(active.getByTestId("timeline-anomaly")).toHaveTextContent(
      sentinel.timelineAnomaly,
    );

    const activeText = activeRoot.textContent ?? "";
    const wrongMode = matrixSentinel(otherMode, symbol);
    const wrongSymbol = matrixSentinel(mode, otherSymbol);
    expect(activeText).not.toContain(wrongMode.summaryPrice);
    expect(activeText).not.toContain(wrongMode.timelinePrice);
    expect(activeText).not.toContain(wrongMode.anomaly);
    expect(activeText).not.toContain(wrongSymbol.summaryPrice);
    expect(activeText).not.toContain(wrongSymbol.timelinePrice);
    expect(activeText).not.toContain(wrongSymbol.anomaly);
  });
}

describe("cross-mode and cross-symbol dashboard identity", () => {
  it("Demo BTC → Demo ETH updates summary, timeline, anomaly, header, and Demo storage only", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "BTCUSDT");
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    render(<MarketIdentityProbe mode="demo" />, {
      wrapper: createWrapper(queryClient),
    });

    await resolveSummary(controlled, "demo");
    await resolveTimeline(controlled, "demo", "BTCUSDT");
    await expectActiveCell("demo", "BTCUSDT");
    expect(controlled.find({ endpoint: "timeline", mode: "demo", symbol: "BTCUSDT" })?.url)
      .toContain("/market/BTCUSDT/timeline?mode=demo");

    fireEvent.click(screen.getByRole("button", { name: "Select ETH" }));
    await resolveTimeline(controlled, "demo", "ETHUSDT");

    await expectActiveCell("demo", "ETHUSDT");
    expect(controlled.find({ endpoint: "timeline", mode: "demo", symbol: "ETHUSDT" })?.url)
      .toContain("/market/ETHUSDT/timeline?mode=demo");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("demo"))).toBe("ETHUSDT");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("live"))).toBe("BTCUSDT");
  });

  it("Demo BTC → Live BTC aborts the obsolete Demo summary and ignores its late completion", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    const view = render(<MarketIdentityProbe mode="demo" />, {
      wrapper: createWrapper(queryClient),
    });

    const demoRequest = await waitForRequest(controlled, {
      endpoint: "summary",
      mode: "demo",
    });
    view.rerender(<MarketIdentityProbe mode="live" />);

    expect(demoRequest.signal?.aborted).toBe(true);
    await resolveSummary(controlled, "live", ["BTCUSDT"]);
    await resolveTimeline(controlled, "live", "BTCUSDT");
    await expectActiveCell("live", "BTCUSDT");
    expect(screen.getByTestId("catalog")).toHaveTextContent("BTCUSDT");
    expect(screen.getByTestId("catalog")).not.toHaveTextContent("DOGEUSDT");

    demoRequest.deferred.resolve(
      createJsonResponse(matrixSummary("demo")),
    );
    await act(async () => Promise.resolve());
    await expectActiveCell("live", "BTCUSDT");
  });

  it("Live BTC → Demo ETH switches both dimensions and ignores the late Live timeline", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "ETHUSDT");
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    const view = render(<MarketIdentityProbe mode="live" />, {
      wrapper: createWrapper(queryClient),
    });

    await resolveSummary(controlled, "live");
    const liveTimeline = await waitForRequest(controlled, {
      endpoint: "timeline",
      mode: "live",
      symbol: "BTCUSDT",
    });

    view.rerender(<MarketIdentityProbe mode="demo" />);
    await resolveSummary(controlled, "demo");
    await resolveTimeline(controlled, "demo", "ETHUSDT");

    expect(liveTimeline.signal?.aborted).toBe(true);
    await expectActiveCell("demo", "ETHUSDT");

    liveTimeline.deferred.resolve(
      createJsonResponse(matrixTimeline("live", "BTCUSDT")),
    );
    await act(async () => Promise.resolve());
    await expectActiveCell("demo", "ETHUSDT");
  });

  it.each([
    ["BTCUSDT", "ETHUSDT"],
    ["ETHUSDT", "BTCUSDT"],
  ] as const)(
    "timeline %s → %s aborts the old symbol and ignores out-of-order completion",
    async (from, to) => {
      window.localStorage.setItem(selectedSymbolStorageKey("demo"), from);
      const controlled = installControlledFetch();
      const queryClient = createQueryClient();
      render(<MarketIdentityProbe mode="demo" />, {
        wrapper: createWrapper(queryClient),
      });
      await resolveSummary(controlled, "demo");
      const obsolete = await waitForRequest(controlled, {
        endpoint: "timeline",
        mode: "demo",
        symbol: from,
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: to === "BTCUSDT" ? "Select BTC" : "Select ETH",
        }),
      );
      const current = await waitForRequest(controlled, {
        endpoint: "timeline",
        mode: "demo",
        symbol: to,
      });

      expect(marketTimelineQueryKey(from, "demo")).not.toEqual(
        marketTimelineQueryKey(to, "demo"),
      );
      expect(obsolete.signal?.aborted).toBe(true);
      expect(current.signal?.aborted).toBe(false);

      await resolveRequest(
        controlled,
        { endpoint: "timeline", mode: "demo", symbol: to },
        matrixTimeline("demo", to),
      );
      await expectActiveCell("demo", to);

      obsolete.deferred.resolve(
        createJsonResponse(matrixTimeline("demo", from)),
      );
      await act(async () => Promise.resolve());
      await expectActiveCell("demo", to);
    },
  );

  it.each([
    ["demo", "live", "BTCUSDT"],
    ["live", "demo", "BTCUSDT"],
    ["demo", "live", "ETHUSDT"],
    ["live", "demo", "ETHUSDT"],
  ] as const)(
    "%s/%s → %s/%s isolates same-symbol summary and timeline caches",
    async (fromMode, toMode, symbol) => {
      window.localStorage.setItem(selectedSymbolStorageKey(fromMode), symbol);
      window.localStorage.setItem(selectedSymbolStorageKey(toMode), symbol);
      const controlled = installControlledFetch();
      const queryClient = createQueryClient();
      const view = render(<MarketIdentityProbe mode={fromMode} />, {
        wrapper: createWrapper(queryClient),
      });

      await resolveSummary(controlled, fromMode);
      await resolveTimeline(controlled, fromMode, symbol);
      await expectActiveCell(fromMode, symbol);

      view.rerender(<MarketIdentityProbe mode={toMode} />);
      await resolveSummary(controlled, toMode);
      await resolveTimeline(controlled, toMode, symbol);
      await expectActiveCell(toMode, symbol);

      expect(dashboardSummaryQueryKeyForMode(fromMode)).not.toEqual(
        dashboardSummaryQueryKeyForMode(toMode),
      );
      expect(marketTimelineQueryKey(symbol, fromMode)).not.toEqual(
        marketTimelineQueryKey(symbol, toMode),
      );
      expect(
        queryClient.getQueryData(dashboardSummaryQueryKeyForMode(fromMode)),
      ).toEqual(matrixSummary(fromMode));
      expect(
        queryClient.getQueryData(dashboardSummaryQueryKeyForMode(toMode)),
      ).toEqual(matrixSummary(toMode));
    },
  );
});

describe("mode-scoped selection and Live availability", () => {
  it("restores Demo ETH and Live BTC repeatedly and ignores other-mode storage events", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(
      dashboardSummaryQueryKeyForMode("demo"),
      matrixSummary("demo"),
    );
    queryClient.setQueryData(
      dashboardSummaryQueryKeyForMode("live"),
      matrixSummary("live"),
    );
    queryClient.setQueryData(
      runtimeModeQueryKey,
      matrixRuntimeMode(["BTCUSDT", "ETHUSDT"]),
    );
    queryClient.setQueryData(
      marketTimelineQueryKey("ETHUSDT", "demo"),
      matrixTimeline("demo", "ETHUSDT"),
    );
    queryClient.setQueryData(
      marketTimelineQueryKey("BTCUSDT", "live"),
      matrixTimeline("live", "BTCUSDT"),
    );
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "ETHUSDT");
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");

    const view = render(<MarketIdentityProbe mode="demo" />, {
      wrapper: createWrapper(queryClient),
    });
    await expectActiveCell("demo", "ETHUSDT");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: selectedSymbolStorageKey("live"),
          newValue: "ETHUSDT",
        }),
      );
    });
    await expectActiveCell("demo", "ETHUSDT");

    view.rerender(<MarketIdentityProbe mode="live" />);
    await expectActiveCell("live", "BTCUSDT");
    view.rerender(<MarketIdentityProbe mode="demo" />);
    await expectActiveCell("demo", "ETHUSDT");
    view.rerender(<MarketIdentityProbe mode="live" />);
    await expectActiveCell("live", "BTCUSDT");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("demo"))).toBe("ETHUSDT");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("live"))).toBe("BTCUSDT");
  });

  it("keeps a configured Live ETH entry without state and shows current-product waiting state", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "ETHUSDT");
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    render(<MarketIdentityProbe mode="live" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitForRequest(controlled, { endpoint: "runtime" });
    await resolveRequest(
      controlled,
      { endpoint: "runtime" },
      matrixRuntimeMode(["BTCUSDT", "ETHUSDT"]),
    );
    await waitForRequest(controlled, { endpoint: "summary", mode: "live" });
    await resolveRequest(
      controlled,
      { endpoint: "summary", mode: "live" },
      matrixSummary("live", ["BTCUSDT"]),
    );

    await waitFor(() => expect(screen.getByTestId("selected-symbol")).toHaveTextContent("ETHUSDT"));
    expect(screen.getByTestId("availability")).toHaveTextContent("configured-unobserved");
    expect(screen.getByTestId("empty-state")).toHaveTextContent("Waiting for market data");
    expect(screen.getByTestId("summary-price")).toHaveTextContent("NO-SUMMARY-PRICE");
    expect(screen.getByTestId("catalog")).toHaveTextContent("BTCUSDT,ETHUSDT");
    expect(screen.getByTestId("catalog")).not.toHaveTextContent("DOGEUSDT");
    expect(screen.getByTestId("active-cell").textContent).not.toContain(
      matrixSentinel("demo", "ETHUSDT").summaryPrice,
    );
  });

  it("falls back only within the current Live catalog when the stored symbol is missing", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "DOGEUSDT");
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    render(<MarketIdentityProbe mode="live" />, {
      wrapper: createWrapper(queryClient),
    });

    await waitForRequest(controlled, { endpoint: "runtime" });
    await resolveRequest(
      controlled,
      { endpoint: "runtime" },
      matrixRuntimeMode(["ETHUSDT"]),
    );
    await waitForRequest(controlled, { endpoint: "summary", mode: "live" });
    await resolveRequest(
      controlled,
      { endpoint: "summary", mode: "live" },
      matrixSummary("live", ["ETHUSDT"]),
    );
    await resolveTimeline(controlled, "live", "ETHUSDT");

    await expectActiveCell("live", "ETHUSDT");
    expect(screen.getByTestId("catalog")).toHaveTextContent("ETHUSDT");
    expect(screen.getByTestId("catalog")).not.toHaveTextContent("BTCUSDT");
    expect(screen.getByTestId("catalog")).not.toHaveTextContent("DOGEUSDT");
  });
});

describe("popup identity isolation", () => {
  it("popup BTC → ETH before the shared summary resolves renders ETH only and preserves return context", async () => {
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    const view = render(
      <PopupProbe mode="demo" returnContext="symbols" symbol="BTCUSDT" />,
      { wrapper: createWrapper(queryClient) },
    );
    await waitForRequest(controlled, { endpoint: "summary", mode: "demo" });

    view.rerender(
      <PopupProbe mode="demo" returnContext="symbols" symbol="ETHUSDT" />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("ETHUSDT market details");
    expect(screen.getByTestId("popup-status")).toHaveTextContent("loading");
    expect(screen.getByTestId("popup-price")).toHaveTextContent("NO-POPUP-RESOURCE");
    expect(screen.getByTestId("popup-return-context")).toHaveTextContent("symbols");

    await resolveRequest(
      controlled,
      { endpoint: "summary", mode: "demo" },
      matrixSummary("demo"),
    );
    const sentinel = matrixSentinel("demo", "ETHUSDT");
    await waitFor(() =>
      expect(screen.getByTestId("popup-status")).toHaveTextContent("success"),
    );
    expect(screen.getByTestId("popup-price")).toHaveTextContent(sentinel.summaryPrice);
    expect(screen.getByTestId("popup-anomaly")).toHaveTextContent(sentinel.anomaly);
    expect(screen.getByTestId("popup-probe").textContent).not.toContain(
      matrixSentinel("demo", "BTCUSDT").summaryPrice,
    );
  });

  it("popup Demo BTC → Live BTC aborts Demo, renders Live first, and ignores late Demo completion", async () => {
    const controlled = installControlledFetch();
    const queryClient = createQueryClient();
    const view = render(<PopupProbe mode="demo" symbol="BTCUSDT" />, {
      wrapper: createWrapper(queryClient),
    });
    const demoRequest = await waitForRequest(controlled, {
      endpoint: "summary",
      mode: "demo",
    });

    view.rerender(<PopupProbe mode="live" symbol="BTCUSDT" />);
    expect(demoRequest.signal?.aborted).toBe(true);
    expect(screen.getByTestId("popup-mode")).toHaveTextContent("live");
    expect(screen.getByTestId("popup-status")).toHaveTextContent("loading");
    expect(screen.getByTestId("popup-price")).toHaveTextContent("NO-POPUP-RESOURCE");

    await waitForRequest(controlled, { endpoint: "runtime" });
    await resolveRequest(
      controlled,
      { endpoint: "runtime" },
      matrixRuntimeMode(["BTCUSDT"]),
    );
    await waitForRequest(controlled, { endpoint: "summary", mode: "live" });
    await resolveRequest(
      controlled,
      { endpoint: "summary", mode: "live" },
      matrixSummary("live", ["BTCUSDT"]),
    );
    await waitFor(() =>
      expect(screen.getByTestId("popup-price")).toHaveTextContent(
        matrixSentinel("live", "BTCUSDT").summaryPrice,
      ),
    );

    demoRequest.deferred.resolve(
      createJsonResponse(matrixSummary("demo", ["BTCUSDT"])),
    );
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("popup-mode")).toHaveTextContent("live");
    expect(screen.getByTestId("popup-price")).toHaveTextContent(
      matrixSentinel("live", "BTCUSDT").summaryPrice,
    );
    expect(screen.getByTestId("popup-probe").textContent).not.toContain(
      matrixSentinel("demo", "BTCUSDT").summaryPrice,
    );
  });
});

describe("four-cell identity consistency", () => {
  it.each([
    ["demo", "BTCUSDT"],
    ["demo", "ETHUSDT"],
    ["live", "BTCUSDT"],
    ["live", "ETHUSDT"],
  ] as const)(
    "%s/%s keeps selector, summary, timeline, anomaly, popup, and mode aligned",
    async (mode, symbol) => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(
        dashboardSummaryQueryKeyForMode(mode),
        matrixSummary(mode),
      );
      queryClient.setQueryData(
        marketTimelineQueryKey(symbol, mode),
        matrixTimeline(mode, symbol),
      );
      queryClient.setQueryData(
        runtimeModeQueryKey,
        matrixRuntimeMode(["BTCUSDT", "ETHUSDT"]),
      );
      window.localStorage.setItem(selectedSymbolStorageKey(mode), symbol);

      render(<MatrixCell mode={mode} symbol={symbol} />, {
        wrapper: createWrapper(queryClient),
      });

      await expectActiveCell(mode, symbol);
      const sentinel = matrixSentinel(mode, symbol);
      expect(screen.getByTestId("popup-mode")).toHaveTextContent(mode);
      expect(screen.getByTestId("popup-symbol")).toHaveTextContent(symbol);
      expect(screen.getByTestId("popup-price")).toHaveTextContent(sentinel.summaryPrice);
      expect(screen.getByTestId("popup-anomaly")).toHaveTextContent(sentinel.anomaly);
    },
  );
});
