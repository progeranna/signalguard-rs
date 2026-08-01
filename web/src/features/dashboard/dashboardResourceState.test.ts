// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "./types";
import {
  resolveDashboardResourceState,
  type DashboardResourceStateInput,
} from "./dashboardResourceState";

const productionSourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/dashboardResourceState.ts",
);
const productionSource = readFileSync(productionSourcePath, "utf8");

function staticImportSpecifiers(value: string): string[] {
  return Array.from(
    value.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    (match) => match[1],
  );
}

function runtimeImportSpecifiers(value: string): string[] {
  const withoutTypeImports = value.replace(
    /^\s*import\s+type\b[\s\S]*?;\s*$/gm,
    "",
  );

  return staticImportSpecifiers(withoutTypeImports);
}

function createSymbol(
  source: UiMode = "live",
  availability: DashboardSymbolSummary["availability"] = "observed",
): DashboardSymbolSummary {
  return {
    availability,
    health: null,
    source,
    state: null,
    symbol: source === "live" ? "BTCUSDT" : "ETHUSDT",
  };
}

function createAnomaly(symbol = "BTCUSDT"): DashboardAnomaly {
  return {
    anomaly_type: "spread_spike",
    created_at: "2026-07-20T10:00:00.000Z",
    event_time: "2026-07-20T10:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    message: "Spread exceeded threshold",
    observed_value: 1.1,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}

function createSummary({
  anomalies = [],
  source = "live",
  symbols = [],
}: Readonly<{
  anomalies?: DashboardAnomaly[];
  source?: UiMode;
  symbols?: DashboardSymbolSummary[];
}> = {}): DashboardSummary {
  return {
    pipeline: {
      cache_errors: 0,
      last_message_age_ms: 100,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: anomalies,
    service: { service: "signalguard-rs", status: "ok" },
    source,
    symbols,
  };
}

function createInput(
  overrides: Partial<DashboardResourceStateInput> = {},
): DashboardResourceStateInput {
  return {
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    ...overrides,
  };
}

describe("resolveDashboardResourceState precedence", () => {
  it("returns loading for initial loading without data", () => {
    expect(resolveDashboardResourceState(createInput({ isLoading: true }))).toEqual({
      isRefreshing: false,
      status: "loading",
    });
  });

  it("returns loading for fetching without data", () => {
    expect(resolveDashboardResourceState(createInput({ isFetching: true }))).toEqual({
      isRefreshing: false,
      status: "loading",
    });
  });

  it("gives active fetching precedence over an error flag without data", () => {
    const error = new Error("request failed while fetching");

    expect(
      resolveDashboardResourceState(
        createInput({ error, isError: true, isFetching: true }),
      ),
    ).toEqual({ isRefreshing: false, status: "loading" });
  });

  it("returns a blocking error without data and preserves the error reference", () => {
    const error = { code: "dashboard-unavailable" };
    const state = resolveDashboardResourceState(
      createInput({ error, isError: true }),
    );

    expect(state).toEqual({ error, isRefreshing: false, status: "error" });
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.error).toBe(error);
    }
  });

  it("returns empty no-data when idle without data or error", () => {
    expect(resolveDashboardResourceState(createInput())).toEqual({
      isRefreshing: false,
      reason: "no-data",
      refreshError: null,
      status: "empty",
      summary: null,
    });
  });

  it("lets existing data win even when isLoading is true", () => {
    const summary = createSummary({ symbols: [createSymbol()] });
    const state = resolveDashboardResourceState(
      createInput({ data: summary, isLoading: true }),
    );

    expect(state).toMatchObject({
      isRefreshing: false,
      refreshError: null,
      status: "success",
    });
    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.summary).toBe(summary);
    }
  });
});

describe("resolveDashboardResourceState data classification", () => {
  it("returns empty no-markets-and-anomalies for an empty supplied summary", () => {
    const summary = createSummary();
    const state = resolveDashboardResourceState(createInput({ data: summary }));

    expect(state).toMatchObject({
      isRefreshing: false,
      reason: "no-markets-and-anomalies",
      refreshError: null,
      status: "empty",
    });
    expect(state.status).toBe("empty");
    if (state.status === "empty") {
      expect(state.summary).toBe(summary);
    }
  });

  it("returns success for symbols without anomalies", () => {
    const summary = createSummary({ symbols: [createSymbol()] });

    expect(resolveDashboardResourceState(createInput({ data: summary }))).toEqual({
      isRefreshing: false,
      refreshError: null,
      status: "success",
      summary,
    });
  });

  it("returns success for anomalies without symbols", () => {
    const summary = createSummary({ anomalies: [createAnomaly()] });

    expect(resolveDashboardResourceState(createInput({ data: summary }))).toEqual({
      isRefreshing: false,
      refreshError: null,
      status: "success",
      summary,
    });
  });

  it("returns success when both symbols and anomalies exist", () => {
    const summary = createSummary({
      anomalies: [createAnomaly()],
      symbols: [createSymbol()],
    });

    expect(resolveDashboardResourceState(createInput({ data: summary }))).toEqual({
      isRefreshing: false,
      refreshError: null,
      status: "success",
      summary,
    });
  });
});

describe("resolveDashboardResourceState cached data", () => {
  it("preserves cached success data while fetching", () => {
    const summary = createSummary({ symbols: [createSymbol()] });
    const state = resolveDashboardResourceState(
      createInput({ data: summary, isFetching: true }),
    );

    expect(state).toEqual({
      isRefreshing: true,
      refreshError: null,
      status: "success",
      summary,
    });
    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.summary).toBe(summary);
    }
  });

  it("preserves cached empty data while fetching", () => {
    const summary = createSummary();
    const state = resolveDashboardResourceState(
      createInput({ data: summary, isFetching: true }),
    );

    expect(state).toEqual({
      isRefreshing: true,
      reason: "no-markets-and-anomalies",
      refreshError: null,
      status: "empty",
      summary,
    });
    expect(state.status).toBe("empty");
    if (state.status === "empty") {
      expect(state.summary).toBe(summary);
    }
  });

  it("preserves cached success data and background error references", () => {
    const summary = createSummary({ symbols: [createSymbol()] });
    const error = { code: "refresh-failed" };
    const state = resolveDashboardResourceState(
      createInput({ data: summary, error, isError: true }),
    );

    expect(state).toEqual({
      isRefreshing: false,
      refreshError: error,
      status: "success",
      summary,
    });
    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.summary).toBe(summary);
      expect(state.refreshError).toBe(error);
    }
  });

  it("preserves cached empty data and background error references", () => {
    const summary = createSummary();
    const error = new Error("empty refresh failed");
    const state = resolveDashboardResourceState(
      createInput({ data: summary, error, isError: true }),
    );

    expect(state).toEqual({
      isRefreshing: false,
      reason: "no-markets-and-anomalies",
      refreshError: error,
      status: "empty",
      summary,
    });
    expect(state.status).toBe("empty");
    if (state.status === "empty") {
      expect(state.summary).toBe(summary);
      expect(state.refreshError).toBe(error);
    }
  });
});

describe("resolveDashboardResourceState identity and purity", () => {
  it("preserves source, symbols, availability, anomalies, and every original reference", () => {
    const symbol = createSymbol("demo", "configured");
    const symbols = [symbol];
    const anomaly = createAnomaly("ETHUSDT");
    const anomalies = [anomaly];
    const summary = createSummary({ anomalies, source: "demo", symbols });
    const state = resolveDashboardResourceState(createInput({ data: summary }));

    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.summary).toBe(summary);
      expect(state.summary.source).toBe("demo");
      expect(state.summary.symbols).toBe(symbols);
      expect(state.summary.symbols[0]).toBe(symbol);
      expect(state.summary.symbols[0]?.availability).toBe("configured");
      expect(state.summary.recent_anomalies).toBe(anomalies);
      expect(state.summary.recent_anomalies[0]).toBe(anomaly);
    }
  });

  it("does not mutate the input, summary, arrays, nested objects, or error", () => {
    const symbol = Object.freeze(createSymbol());
    const symbols = Object.freeze([symbol]) as unknown as DashboardSymbolSummary[];
    const anomaly = Object.freeze(createAnomaly());
    const anomalies = Object.freeze([anomaly]) as unknown as DashboardAnomaly[];
    const summary = Object.freeze(
      createSummary({ anomalies, symbols }),
    ) as DashboardSummary;
    const error = Object.freeze({ code: "background-error" });
    const input = Object.freeze(
      createInput({ data: summary, error, isError: true, isFetching: true }),
    );

    const state = resolveDashboardResourceState(input);

    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.summary).toBe(summary);
      expect(state.refreshError).toBe(error);
      expect(state.isRefreshing).toBe(true);
    }
    expect(input.data).toBe(summary);
    expect(summary.symbols).toBe(symbols);
    expect(summary.recent_anomalies).toBe(anomalies);
    expect(summary.symbols[0]).toBe(symbol);
    expect(summary.recent_anomalies[0]).toBe(anomaly);
  });

  it("returns equal values for equal inputs while preserving intentional references", () => {
    const summary = createSummary({ symbols: [createSymbol()] });
    const error = { code: "stable-error-reference" };
    const input = createInput({ data: summary, error, isError: true });

    const first = resolveDashboardResourceState(input);
    const second = resolveDashboardResourceState(input);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    if (first.status === "success" && second.status === "success") {
      expect(first.summary).toBe(summary);
      expect(second.summary).toBe(summary);
      expect(first.refreshError).toBe(error);
      expect(second.refreshError).toBe(error);
    }
  });

  it("allows type-only model imports and rejects runtime ownership", () => {
    const imports = staticImportSpecifiers(productionSource);
    const runtimeImports = runtimeImportSpecifiers(productionSource);

    expect(imports).toEqual(["./types"]);
    expect(runtimeImports).toEqual([]);
    expect(productionSource).not.toMatch(
      /(?:fetch|XMLHttpRequest|WebSocket|window|document|navigator|localStorage|sessionStorage|Date\.now\s*\(|new\s+Date\s*\(\s*\)|setTimeout|setInterval|Math\.random|process\.env)/,
    );
  });
});
