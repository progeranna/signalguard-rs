import { createElement, type PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useDashboardSummaryQuery,
  useMarketTimelineQuery,
  useRuntimeModeQuery,
} from "./api";

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

function dashboardSummary(symbol: string) {
  return {
    service: { service: "signalguard-rs", status: "ok" },
    pipeline: {
      depth_sequence_gap_count: 0,
      last_message_age_ms: 20,
      cache_errors: 0,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: [],
    symbols: [
      {
        health: null,
        state: null,
        symbol,
      },
    ],
  };
}

function marketTimeline(symbol: string) {
  return {
    anomalies: [],
    points: [],
    symbol,
  };
}

function runtimeMode() {
  return {
    last_error: null,
    last_started_at: null,
    last_switched_at: null,
    mode: "live",
    mode_label: "Live",
    source: "runtime",
    status: "running",
    switching_supported: true,
    symbols: ["BTCUSDT"],
  };
}

function installPendingFetch({ rejectOnAbort = true } = {}) {
  const requests: PendingRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const deferred = createDeferred<Response>();
    const signal = init?.signal ?? undefined;
    const request = {
      deferred,
      signal,
      url: String(input),
    };
    requests.push(request);

    signal?.addEventListener(
      "abort",
      () => {
        if (rejectOnAbort) {
          const abortError = new Error("The request was aborted");
          abortError.name = "AbortError";
          deferred.reject(abortError);
        }
      },
      { once: true },
    );

    return deferred.promise;
  });
  vi.stubGlobal("fetch", fetchMock);

  return { fetchMock, requests };
}

describe("dashboard query function signals", () => {
  it("passes TanStack Query's signal to the dashboard summary request", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result } = renderHook(() => useDashboardSummaryQuery("demo"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url).toContain("/dashboard/summary?mode=demo");
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.signal?.aborted).toBe(false);

    requests[0]?.deferred.resolve(jsonResponse(dashboardSummary("BTCUSDT")));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("passes TanStack Query's signal to the market timeline request", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result } = renderHook(() => useMarketTimelineQuery("BTCUSDT", "demo"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url).toContain("/market/BTCUSDT/timeline?mode=demo");
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.signal?.aborted).toBe(false);

    requests[0]?.deferred.resolve(jsonResponse(marketTimeline("BTCUSDT")));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("passes TanStack Query's signal to the runtime-mode request", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result } = renderHook(() => useRuntimeModeQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url).toContain("/runtime/mode");
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(requests[0]?.signal?.aborted).toBe(false);

    requests[0]?.deferred.resolve(jsonResponse(runtimeMode()));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("mode and symbol request cancellation", () => {
  it.each([
    ["demo", "live"],
    ["live", "demo"],
  ] as const)("aborts obsolete summary requests when mode changes from %s to %s", async (from, to) => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "demo" | "live" }) => useDashboardSummaryQuery(mode),
      {
        initialProps: { mode: from },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    const obsolete = requests[0];

    rerender({ mode: to });
    await waitFor(() => expect(requests).toHaveLength(2));

    expect(obsolete?.signal?.aborted).toBe(true);
    expect(requests[1]?.signal?.aborted).toBe(false);

    requests[1]?.deferred.resolve(jsonResponse(dashboardSummary("ETHUSDT")));
    await waitFor(() => expect(result.current.data?.symbols[0]?.symbol).toBe("ETHUSDT"));
  });

  it.each([
    ["BTCUSDT", "ETHUSDT"],
    ["ETHUSDT", "BTCUSDT"],
  ] as const)("aborts obsolete timeline requests when symbol changes from %s to %s", async (from, to) => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result, rerender } = renderHook(
      ({ symbol }: { symbol: string }) => useMarketTimelineQuery(symbol, "demo"),
      {
        initialProps: { symbol: from },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    const obsolete = requests[0];

    rerender({ symbol: to });
    await waitFor(() => expect(requests).toHaveLength(2));

    expect(obsolete?.signal?.aborted).toBe(true);
    expect(requests[1]?.signal?.aborted).toBe(false);

    requests[1]?.deferred.resolve(jsonResponse(marketTimeline(to)));
    await waitFor(() => expect(result.current.data?.symbol).toBe(to));
  });

  it("keeps a later response active when an obsolete response resolves out of order", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch({ rejectOnAbort: false });
    const { result, rerender } = renderHook(
      ({ symbol }: { symbol: string }) => useMarketTimelineQuery(symbol, "demo"),
      {
        initialProps: { symbol: "BTCUSDT" },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    const obsolete = requests[0];
    rerender({ symbol: "ETHUSDT" });
    await waitFor(() => expect(requests).toHaveLength(2));

    requests[1]?.deferred.resolve(jsonResponse(marketTimeline("ETHUSDT")));
    await waitFor(() => expect(result.current.data?.symbol).toBe("ETHUSDT"));

    obsolete?.deferred.resolve(jsonResponse(marketTimeline("BTCUSDT")));
    await act(async () => {
      await Promise.resolve();
    });

    expect(obsolete?.signal?.aborted).toBe(true);
    expect(result.current.data?.symbol).toBe("ETHUSDT");
  });

  it("aborts an in-flight request when its final observer unmounts", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { unmount } = renderHook(() => useMarketTimelineQuery("BTCUSDT", "demo"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    const request = requests[0];
    expect(request?.signal?.aborted).toBe(false);

    unmount();

    expect(request?.signal?.aborted).toBe(true);
  });
});

describe("disabled symbol queries", () => {
  it.each([null, "", "   ", "BTC-USDT", "BTC/USDT"] as const)(
    "does not request an invalid symbol: %s",
    (symbol) => {
      const queryClient = createQueryClient();
      const { requests } = installPendingFetch();

      renderHook(() => useMarketTimelineQuery(symbol, "demo"), {
        wrapper: createWrapper(queryClient),
      });

      expect(requests).toHaveLength(0);
    },
  );

  it("requests a valid symbol without fabricating a fallback", async () => {
    const queryClient = createQueryClient();
    const { requests } = installPendingFetch();
    const { result } = renderHook(() => useMarketTimelineQuery("BTCUSDT", "live"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url).toContain("/market/BTCUSDT/timeline?mode=live");
    expect(requests[0]?.url).not.toContain("BTCUSDTBTCUSDT");

    requests[0]?.deferred.resolve(jsonResponse(marketTimeline("BTCUSDT")));
    await waitFor(() => expect(result.current.data?.symbol).toBe("BTCUSDT"));
  });
});
