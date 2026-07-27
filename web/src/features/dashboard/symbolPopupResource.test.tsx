import { createElement, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api/errors";

import { createSymbolPopupIdentity } from "./symbolPopup";
import {
  resolveSymbolPopupResource,
  useSymbolPopupResource,
} from "./symbolPopupResource";
import {
  resolveSymbolMarketResource,
  useSymbolMarketResource,
  type SymbolMarketQueryBundle,
} from "./symbolMarketResource";
import { parseSymbolId } from "./symbolId";
import type {
  AnomaliesResponse,
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  MarketHealth,
  MarketState,
  MarketTimeline,
  UiMode,
} from "./types";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

type PendingRequest = {
  deferred: Deferred<Response>;
  signal: AbortSignal | undefined;
  url: string;
};

const queryClients: QueryClient[] = [];

const refetch = vi.fn(async () => undefined);

afterEach(() => {
  queryClients.splice(0).forEach((queryClient) => queryClient.clear());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
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

function jsonResponse(payload: unknown, status = 200): Response {
  const body = JSON.stringify(payload);

  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    json: async () => JSON.parse(body),
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function installPendingFetch() {
  const requests: PendingRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const deferred = createDeferred<Response>();
    requests.push({
      deferred,
      signal: init?.signal ?? undefined,
      url: String(input),
    });
    return deferred.promise;
  });
  vi.stubGlobal("fetch", fetchMock);

  return requests;
}

function requestByUrl(requests: PendingRequest[], fragment: string) {
  const request = requests.find((candidate) => candidate.url.includes(fragment));

  if (!request) {
    throw new Error(`request not found: ${fragment}`);
  }

  return request;
}

function symbolId(symbol: string) {
  const parsed = parseSymbolId(symbol);

  if (!parsed) {
    throw new TypeError(`invalid test symbol: ${symbol}`);
  }

  return parsed;
}

function observedSymbol(symbol: string, price: string): DashboardSymbolSummary {
  return {
    source: "demo",
    availability: "observed",
    health: {
      evaluated_at: "2026-07-20T10:00:00.000Z",
      recent_anomaly_count: 0,
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

function anomaly(symbol: string, id: string): DashboardAnomaly {
  return {
    anomaly_type: "spread_spike",
    created_at: "2026-07-20T10:00:00.000Z",
    event_time: "2026-07-20T10:00:00.000Z",
    id,
    message: `${symbol} anomaly`,
    observed_value: 1,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}

function dashboardSummary(
  symbols: DashboardSymbolSummary[],
  anomalies: DashboardAnomaly[] = [],
): DashboardSummary {
  return {
    source: "demo",
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

function marketState(symbol: string, price: string): MarketState {
  return {
    source: "live",
    availability: "observed",
    best_ask_price: price,
    best_bid_price: price,
    depth_sequence_gap_count: 0,
    last_event_age_ms: 100,
    last_event_time: "2026-07-20T10:00:00.000Z",
    last_trade_price: price,
    price_change_1m_pct: 0.1,
    spread_pct: 0.01,
    symbol,
    trades_per_minute: 12,
  };
}

function marketHealth(symbol: string): MarketHealth {
  return {
    source: "live",
    availability: "observed",
    evaluated_at: "2026-07-20T10:00:00.000Z",
    recent_anomaly_count: 1,
    score: 95,
    status: "healthy",
    symbol,
  };
}

function marketTimeline(
  symbol: string,
  anomalies: DashboardAnomaly[] = [],
): MarketTimeline {
  return {
    source: "demo",
    anomalies,
    points: [
      {
        last_event_age_ms: 100,
        price: symbol === "BTCUSDT" ? "100" : "200",
        spread_pct: 0.01,
        timestamp: "2026-07-20T10:00:00.000Z",
        trades_per_minute: 12,
      },
    ],
    symbol,
  };
}

function anomaliesResponse(anomalies: DashboardAnomaly[]): AnomaliesResponse {
  return { source: "live", anomalies };
}

function query<T>(
  data: T | null | undefined,
  options: { error?: unknown; isError?: boolean; isLoading?: boolean } = {},
) {
  return {
    data,
    error: options.error ?? null,
    isError: options.isError ?? false,
    isLoading: options.isLoading ?? false,
    refetch,
  };
}

function bundle(overrides: Partial<SymbolMarketQueryBundle> = {}): SymbolMarketQueryBundle {
  return {
    anomalies: query<AnomaliesResponse>(undefined),
    demoSummary: query<DashboardSummary>(undefined),
    health: query<MarketHealth>(undefined),
    state: query<MarketState>(undefined),
    timeline: query<MarketTimeline>(undefined),
    ...overrides,
  };
}

async function resolveLiveRequests(
  requests: PendingRequest[],
  symbol: string,
  price: string,
) {
  const anomalyValue = anomaly(
    symbol,
    symbol === "BTCUSDT"
      ? "00000000-0000-4000-8000-000000000001"
      : "00000000-0000-4000-8000-000000000002",
  );

  await act(async () => {
    requestByUrl(requests, `/market/${symbol}/state`).deferred.resolve(
      jsonResponse(marketState(symbol, price)),
    );
    requestByUrl(requests, `/market/${symbol}/health`).deferred.resolve(
      jsonResponse(marketHealth(symbol)),
    );
    requestByUrl(requests, `/anomalies?limit=50&symbol=${symbol}`).deferred.resolve(
      jsonResponse(anomaliesResponse([anomalyValue])),
    );
  });
}

describe("symbol market resource states", () => {
  it("returns explicit loading, error, unavailable, and empty-anomaly success states", () => {
    const identity = { mode: "live" as const, symbol: symbolId("BTCUSDT") };

    expect(
      resolveSymbolMarketResource(
        identity,
        bundle({ state: query<MarketState>(undefined, { isLoading: true }) }),
      ),
    ).toMatchObject({ identity, status: "loading" });

    const failure = new Error("health failed");
    expect(
      resolveSymbolMarketResource(
        identity,
        bundle({ health: query<MarketHealth>(undefined, { error: failure, isError: true }) }),
      ),
    ).toMatchObject({ error: failure, identity, status: "error" });

    expect(
      resolveSymbolMarketResource(
        identity,
        bundle({
          state: query<MarketState>(undefined, {
            error: new ApiError({ code: "not_found", message: "missing", status: 404 }),
            isError: true,
          }),
        }),
      ),
    ).toMatchObject({ identity, status: "unavailable" });

    const success = resolveSymbolMarketResource(
      identity,
      bundle({
        anomalies: query(anomaliesResponse([])),
        health: query(marketHealth("BTCUSDT")),
        state: query(marketState("BTCUSDT", "100")),
      }),
    );

    expect(success.status).toBe("success");
    if (success.status === "success") {
      expect(success.resource.anomalies).toEqual([]);
      expect(success.resource.summary.state?.last_trade_price).toBe("100");
    }
  });

  it("uses Demo summary state and dedicated Demo timeline anomalies without Live fallback", () => {
    const identity = { mode: "demo" as const, symbol: symbolId("ETHUSDT") };
    const ethAnomaly = anomaly(
      "ETHUSDT",
      "00000000-0000-4000-8000-000000000002",
    );
    const state = resolveSymbolMarketResource(
      identity,
      bundle({
        demoSummary: query(
          dashboardSummary([
            observedSymbol("BTCUSDT", "100"),
            observedSymbol("ETHUSDT", "200"),
          ]),
        ),
        timeline: query(marketTimeline("ETHUSDT", [ethAnomaly])),
      }),
    );

    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.resource.mode).toBe("demo");
      expect(state.resource.symbol).toBe("ETHUSDT");
      expect(state.resource.summary.state?.last_trade_price).toBe("200");
      expect(state.resource.anomalies).toEqual([ethAnomaly]);
    }
  });

  it("rejects a response that claims another symbol identity", () => {
    const identity = { mode: "live" as const, symbol: symbolId("ETHUSDT") };

    expect(() =>
      resolveSymbolMarketResource(
        identity,
        bundle({
          anomalies: query(anomaliesResponse([])),
          health: query(marketHealth("ETHUSDT")),
          state: query(marketState("BTCUSDT", "100")),
        }),
      ),
    ).toThrow(/state resource symbol mismatch/);
  });
});

describe("out-of-order symbol responses", () => {
  it("never renders late BTC data under ETH and then renders ETH correctly", async () => {
    const requests = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ symbol }: { symbol: string }) =>
        useSymbolMarketResource({ mode: "live", symbol: symbolId(symbol) }),
      {
        initialProps: { symbol: "BTCUSDT" },
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(3));
    const btcRequests = [...requests];

    rerender({ symbol: "ETHUSDT" });
    await waitFor(() => expect(requests).toHaveLength(6));

    expect(btcRequests.every((request) => request.signal?.aborted)).toBe(true);
    expect(result.current).toMatchObject({
      identity: { mode: "live", symbol: "ETHUSDT" },
      status: "loading",
    });

    await act(async () => {
      requestByUrl(btcRequests, "/market/BTCUSDT/state").deferred.resolve(
        jsonResponse(marketState("BTCUSDT", "100")),
      );
      requestByUrl(btcRequests, "/market/BTCUSDT/health").deferred.resolve(
        jsonResponse(marketHealth("BTCUSDT")),
      );
      requestByUrl(btcRequests, "/anomalies?limit=50&symbol=BTCUSDT").deferred.resolve(
        jsonResponse(anomaliesResponse([])),
      );
    });

    expect(result.current.status).toBe("loading");
    expect(result.current.identity.symbol).toBe("ETHUSDT");
    expect("resource" in result.current).toBe(false);

    await resolveLiveRequests(requests.slice(3), "ETHUSDT", "200");
    await waitFor(() => expect(result.current.status).toBe("success"));

    expect(result.current.status).toBe("success");
    if (result.current.status === "success") {
      expect(result.current.resource.symbol).toBe("ETHUSDT");
      expect(result.current.resource.summary.state?.last_trade_price).toBe("200");
      expect(result.current.resource.anomalies[0]?.symbol).toBe("ETHUSDT");
    }
  });
});

describe("mode isolation", () => {
  it("detaches Demo immediately and ignores its late response in Live", async () => {
    const requests = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: UiMode }) =>
        useSymbolMarketResource({ mode, symbol: symbolId("BTCUSDT") }),
      {
        initialProps: { mode: "demo" as UiMode },
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    const demoRequests = [...requests];

    rerender({ mode: "live" });
    await waitFor(() => expect(requests).toHaveLength(5));

    expect(demoRequests.every((request) => request.signal?.aborted)).toBe(true);
    expect(result.current).toMatchObject({
      identity: { mode: "live", symbol: "BTCUSDT" },
      status: "loading",
    });

    await resolveLiveRequests(requests.slice(2), "BTCUSDT", "300");
    await waitFor(() => expect(result.current.status).toBe("success"));

    await act(async () => {
      requestByUrl(demoRequests, "/dashboard/summary?mode=demo").deferred.resolve(
        jsonResponse(dashboardSummary([observedSymbol("BTCUSDT", "100")])),
      );
      requestByUrl(demoRequests, "/market/BTCUSDT/timeline?mode=demo").deferred.resolve(
        jsonResponse(marketTimeline("BTCUSDT")),
      );
    });

    expect(result.current.status).toBe("success");
    if (result.current.status === "success") {
      expect(result.current.resource.mode).toBe("live");
      expect(result.current.resource.summary.state?.last_trade_price).toBe("300");
    }
  });
});

describe("popup compatibility", () => {
  it("keeps popup presentation context attached without adding it to server requests", async () => {
    const requests = installPendingFetch();
    const identity = createSymbolPopupIdentity(
      "live",
      "BTCUSDT",
      "anomalies",
    );

    if (!identity) {
      throw new TypeError("expected valid popup identity");
    }

    const { result } = renderHook(() => useSymbolPopupResource(identity), {
      wrapper: createWrapper(createQueryClient()),
    });

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(result.current.identity).toBe(identity);
    expect(requests.every((request) => !request.url.includes("popup"))).toBe(true);
    expect(requests.every((request) => !request.url.includes("anomalies%3A"))).toBe(true);
  });

  it("preserves popup resolver return context", () => {
    const identity = createSymbolPopupIdentity(
      "demo",
      "BTCUSDT",
      "symbols",
    );

    if (!identity) {
      throw new TypeError("expected valid popup identity");
    }

    const state = resolveSymbolPopupResource(
      identity,
      bundle({
        demoSummary: query(dashboardSummary([observedSymbol("BTCUSDT", "100")])),
        timeline: query(marketTimeline("BTCUSDT")),
      }),
    );

    expect(state.status).toBe("success");
    expect(state.identity).toBe(identity);
    expect(state.identity.returnContext).toBe("symbols");
  });
});
