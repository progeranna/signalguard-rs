import { readFileSync } from "node:fs";
import path from "node:path";

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardSummary, UiMode } from "./types";

const testState = vi.hoisted(() => ({
  options: [] as unknown[],
  queryResult: null as unknown,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    testState.options.push(options);
    return testState.queryResult;
  },
}));

import {
  useCatalogDashboardSummaryQuery,
  useDashboardSummaryQuery,
} from "./api";

function readSource(repositoryPath: string): string {
  return readFileSync(path.join(process.cwd(), repositoryPath), "utf8");
}

const apiSource = readSource("src/features/dashboard/api.ts");
const appShellSource = readSource("src/app/AppShell.tsx");
const dashboardSource = readSource("src/pages/DashboardPage.tsx");
const tickerSource = readSource("src/app/GlobalMarketTicker.tsx");

function serverSummary(mode: UiMode): DashboardSummary {
  return {
    source: mode,
    pipeline: {
      cache_errors: 0,
      last_message_age_ms: 100,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: [],
    service: { service: "signalguard-rs", status: "ok" },
    symbols: [
      {
        source: mode,
        availability: "observed",
        health: null,
        state: null,
        symbol: "CUSTOMUSDT",
      },
    ],
  };
}

beforeEach(() => {
  testState.options.splice(0);
  testState.queryResult = null;
});

describe("market catalog consumer wiring", () => {
  it("keeps the upper ticker on the raw dashboard summary hook", () => {
    expect(tickerSource).toContain("useDashboardSummaryQuery");
    expect(tickerSource).not.toContain("useCatalogDashboardSummaryQuery");
  });

  it("routes only mode-aware catalog consumers through the catalog hook", () => {
    for (const source of [appShellSource, dashboardSource]) {
      expect(source).toContain("useCatalogDashboardSummaryQuery");
      expect(source).not.toContain("useDashboardSummaryQuery(selectedUiMode)");
    }
  });

  it("returns the raw server summary unchanged from exactly one raw query", () => {
    const summary = Object.freeze(serverSummary("demo"));
    const refetch = vi.fn();
    const queryResult = Object.freeze({
      data: summary,
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch,
    });
    testState.queryResult = queryResult;

    const { result } = renderHook(() => useDashboardSummaryQuery("demo"));

    expect(testState.options).toHaveLength(1);
    expect(result.current).toBe(queryResult);
    expect(result.current.data).toBe(summary);
    expect(result.current.data?.symbols).toBe(summary.symbols);
    expect(result.current.data?.symbols.map(({ symbol }) => symbol)).toEqual([
      "CUSTOMUSDT",
    ]);
  });

  it("keeps the catalog wrapper on the same accepted single query result without Demo fallback", () => {
    const summary = Object.freeze(serverSummary("live"));
    const queryResult = Object.freeze({
      data: summary,
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    testState.queryResult = queryResult;

    const { result } = renderHook(() =>
      useCatalogDashboardSummaryQuery("live"),
    );

    expect(testState.options).toHaveLength(1);
    expect(result.current).toBe(queryResult);
    expect(result.current.data).toBe(summary);
    expect(result.current.data?.source).toBe("live");
    expect(result.current.data?.symbols).toEqual(summary.symbols);
    expect(result.current.data?.symbols).toHaveLength(1);
    expect(result.current.data?.symbols[0]?.symbol).toBe("CUSTOMUSDT");
  });

  it("keeps raw and catalog hooks free of client-side coverage owners", () => {
    expect(apiSource).not.toContain("buildMarketCatalog");
    expect(apiSource).not.toContain("marketCatalogDashboardSymbols");
  });

  it("does not let catalog-aware pages reapply Demo coverage", () => {
    expect(dashboardSource).not.toContain("buildCoveredDashboardSymbols");
    expect(appShellSource).not.toContain("buildCoveredDashboardSymbols");
  });
});
