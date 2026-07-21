import { createElement, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSymbolPopupIdentity } from "./symbolPopup";
import {
  resolveSymbolPopupResource,
  useSymbolPopupResource,
} from "./symbolPopupResource";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
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

function jsonResponse(payload: unknown): Response {
  const body = JSON.stringify(payload);

  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    json: async () => JSON.parse(body),
    ok: true,
    status: 200,
    text: async () => body,
  } as Response;
}

function observedSymbol(symbol: string, price: string): DashboardSymbolSummary {
  return {
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

function runtimeMode(symbols: string[]) {
  return {
    last_error: null,
    last_started_at: null,
    last_switched_at: null,
    mode: "live",
    mode_label: "Live",
    source: "runtime",
    status: "running",
    switching_supported: true,
    symbols,
  };
}

function installPendingFetch({ rejectOnAbort = false } = {}) {
  const requests: PendingRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const deferred = createDeferred<Response>();
    const signal = init?.signal ?? undefined;
    const request = { deferred, signal, url: String(input) };
    requests.push(request);

    signal?.addEventListener(
      "abort",
      () => {
        if (rejectOnAbort) {
          const error = new Error("The request was aborted");
          error.name = "AbortError";
          deferred.reject(error);
        }
      },
      { once: true },
    );

    return deferred.promise;
  });
  vi.stubGlobal("fetch", fetchMock);

  return requests;
}

function identity(mode: UiMode, symbol: string) {
  const value = createSymbolPopupIdentity(mode, symbol, "dashboard");

  if (!value) {
    throw new TypeError(`invalid test identity: ${mode}/${symbol}`);
  }

  return value;
}

function requestByUrl(requests: PendingRequest[], fragment: string) {
  const request = requests.find((candidate) => candidate.url.includes(fragment));

  if (!request) {
    throw new Error(`request not found: ${fragment}`);
  }

  return request;
}

const refetch = vi.fn(async () => undefined);

describe("symbol popup resource selector", () => {
  it("returns only the requested canonical symbol and its anomalies", () => {
    const state = resolveSymbolPopupResource(identity("demo", "BTCUSDT"), {
      data: dashboardSummary(
        [
          observedSymbol("BTCUSDT", "100"),
          observedSymbol("ETHUSDT", "200"),
        ],
        [
          anomaly("BTCUSDT", "00000000-0000-4000-8000-000000000001"),
          anomaly("ETHUSDT", "00000000-0000-4000-8000-000000000002"),
        ],
      ),
      error: null,
      isError: false,
      isLoading: false,
      refetch,
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") {
      return;
    }
    expect(state.resource.symbol).toBe("BTCUSDT");
    expect(state.resource.summary.state?.last_trade_price).toBe("100");
    expect(state.resource.anomalies).toHaveLength(1);
    expect(state.resource.anomalies[0]?.symbol).toBe("BTCUSDT");
  });

  it("keeps loading, error, and unavailable states attached to identity", () => {
    const popupIdentity = identity("live", "ETHUSDT");

    expect(
      resolveSymbolPopupResource(popupIdentity, {
        data: null,
        error: null,
        isError: false,
        isLoading: true,
        refetch,
      }),
    ).toMatchObject({ identity: popupIdentity, status: "loading" });
    expect(
      resolveSymbolPopupResource(popupIdentity, {
        data: null,
        error: new Error("failed"),
        isError: true,
        isLoading: false,
        refetch,
      }),
    ).toMatchObject({ identity: popupIdentity, status: "error" });
    expect(
      resolveSymbolPopupResource(popupIdentity, {
        data: dashboardSummary([observedSymbol("BTCUSDT", "100")]),
        error: null,
        isError: false,
        isLoading: false,
        refetch,
      }),
    ).toMatchObject({ identity: popupIdentity, status: "unavailable" });
  });
});

describe("rapid popup symbol changes", () => {
  it.each([
    ["BTCUSDT", "ETHUSDT", "200"],
    ["ETHUSDT", "BTCUSDT", "100"],
  ] as const)(
    "detaches %s immediately and selects only %s when the pending summary resolves",
    async (from, to, toPrice) => {
      const requests = installPendingFetch();
      const { result, rerender } = renderHook(
        ({ symbol }: { symbol: string }) =>
          useSymbolPopupResource(identity("demo", symbol)),
        {
          initialProps: { symbol: from },
          wrapper: createWrapper(createQueryClient()),
        },
      );

      await waitFor(() => expect(requests).toHaveLength(1));
      rerender({ symbol: to });

      expect(requests).toHaveLength(1);
      expect(result.current.status).toBe("loading");
      expect(result.current.identity.symbol).toBe(to);
      expect("resource" in result.current).toBe(false);

      requests[0]?.deferred.resolve(
        jsonResponse(
          dashboardSummary([
            observedSymbol("BTCUSDT", "100"),
            observedSymbol("ETHUSDT", "200"),
          ]),
        ),
      );

      await waitFor(() => expect(result.current.status).toBe("success"));
      expect(result.current.status).toBe("success");
      if (result.current.status !== "success") {
        return;
      }
      expect(result.current.resource.symbol).toBe(to);
      expect(result.current.resource.summary.state?.last_trade_price).toBe(toPrice);
    },
  );

  it("never renders cached BTC content under an ETH identity", async () => {
    const requests = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ symbol }: { symbol: string }) =>
        useSymbolPopupResource(identity("demo", symbol)),
      {
        initialProps: { symbol: "BTCUSDT" },
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]?.deferred.resolve(
      jsonResponse(
        dashboardSummary([
          observedSymbol("BTCUSDT", "100"),
          observedSymbol("ETHUSDT", "200"),
        ]),
      ),
    );
    await waitFor(() => expect(result.current.status).toBe("success"));

    rerender({ symbol: "ETHUSDT" });

    expect(result.current.status).toBe("success");
    if (result.current.status !== "success") {
      return;
    }
    expect(result.current.identity.symbol).toBe("ETHUSDT");
    expect(result.current.resource.symbol).toBe("ETHUSDT");
    expect(result.current.resource.summary.state?.last_trade_price).toBe("200");
  });
});

describe("popup mode changes", () => {
  it("detaches Demo immediately and ignores its late response in Live", async () => {
    const requests = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: UiMode }) =>
        useSymbolPopupResource(identity(mode, "BTCUSDT")),
      {
        initialProps: { mode: "demo" as UiMode },
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    const demoRequest = requests[0];

    rerender({ mode: "live" });
    await waitFor(() => expect(requests).toHaveLength(3));

    expect(demoRequest?.signal?.aborted).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(result.current.identity.mode).toBe("live");

    requestByUrl(requests, "/dashboard/summary?mode=live").deferred.resolve(
      jsonResponse(dashboardSummary([observedSymbol("BTCUSDT", "300")])),
    );
    requestByUrl(requests, "/runtime/mode").deferred.resolve(
      jsonResponse(runtimeMode(["BTCUSDT"])),
    );

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.status).toBe("success");
    if (result.current.status !== "success") {
      return;
    }
    expect(result.current.resource.mode).toBe("live");
    expect(result.current.resource.summary.state?.last_trade_price).toBe("300");

    demoRequest?.deferred.resolve(
      jsonResponse(dashboardSummary([observedSymbol("BTCUSDT", "100")])),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("success");
    if (result.current.status !== "success") {
      return;
    }
    expect(result.current.resource.mode).toBe("live");
    expect(result.current.resource.summary.state?.last_trade_price).toBe("300");
  });

  it("detaches Live immediately and restores only Demo data", async () => {
    const requests = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: UiMode }) =>
        useSymbolPopupResource(identity(mode, "ETHUSDT")),
      {
        initialProps: { mode: "live" as UiMode },
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    const liveSummary = requestByUrl(requests, "/dashboard/summary?mode=live");
    const liveRuntime = requestByUrl(requests, "/runtime/mode");

    rerender({ mode: "demo" });
    await waitFor(() => expect(requests).toHaveLength(3));

    expect(liveSummary.signal?.aborted).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(result.current.identity.mode).toBe("demo");

    requestByUrl(requests, "/dashboard/summary?mode=demo").deferred.resolve(
      jsonResponse(dashboardSummary([observedSymbol("ETHUSDT", "200")])),
    );
    await waitFor(() => expect(result.current.status).toBe("success"));

    liveSummary.deferred.resolve(
      jsonResponse(dashboardSummary([observedSymbol("ETHUSDT", "400")])),
    );
    liveRuntime.deferred.resolve(jsonResponse(runtimeMode(["ETHUSDT"])));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("success");
    if (result.current.status !== "success") {
      return;
    }
    expect(result.current.resource.mode).toBe("demo");
    expect(result.current.resource.summary.state?.last_trade_price).toBe("200");
  });

  it("returns explicit unavailability without Demo fallback in Live", async () => {
    const requests = installPendingFetch();
    const { result } = renderHook(
      () => useSymbolPopupResource(identity("live", "BTCUSDT")),
      { wrapper: createWrapper(createQueryClient()) },
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    requestByUrl(requests, "/dashboard/summary?mode=live").deferred.resolve(
      jsonResponse(dashboardSummary([observedSymbol("ETHUSDT", "200")])),
    );
    requestByUrl(requests, "/runtime/mode").deferred.resolve(
      jsonResponse(runtimeMode(["ETHUSDT"])),
    );

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.identity).toMatchObject({
      mode: "live",
      symbol: "BTCUSDT",
    });
    expect("resource" in result.current).toBe(false);
  });

  it("returns configured-unobserved Live markets as unavailable", async () => {
    const requests = installPendingFetch();
    const { result } = renderHook(
      () => useSymbolPopupResource(identity("live", "BTCUSDT")),
      { wrapper: createWrapper(createQueryClient()) },
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    requestByUrl(requests, "/dashboard/summary?mode=live").deferred.resolve(
      jsonResponse(dashboardSummary([])),
    );
    requestByUrl(requests, "/runtime/mode").deferred.resolve(
      jsonResponse(runtimeMode(["BTCUSDT"])),
    );

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});

describe("identity-specific resource errors", () => {
  it("keeps an error attached to the requested identity", async () => {
    const requests = installPendingFetch();
    const { result } = renderHook(
      () => useSymbolPopupResource(identity("demo", "ETHUSDT")),
      { wrapper: createWrapper(createQueryClient()) },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]?.deferred.reject(new Error("ETH summary failed"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.identity).toMatchObject({
      mode: "demo",
      symbol: "ETHUSDT",
    });
    expect(result.current.status).toBe("error");
    if (result.current.status === "error") {
      expect(result.current.error).toEqual(new Error("ETH summary failed"));
    }
  });
});
