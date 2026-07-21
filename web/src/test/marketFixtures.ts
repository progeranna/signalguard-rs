import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  MarketTimeline,
  RuntimeModeResponse,
  UiMode,
} from "@/features/dashboard/types";

export type MatrixSymbol = "BTCUSDT" | "ETHUSDT";

const prices = {
  "demo:BTCUSDT": { summary: "11001.01", timeline: "11101.01" },
  "demo:ETHUSDT": { summary: "22002.02", timeline: "22202.02" },
  "live:BTCUSDT": { summary: "33003.03", timeline: "33303.03" },
  "live:ETHUSDT": { summary: "44004.04", timeline: "44404.04" },
} as const;

export function matrixSentinel(mode: UiMode, symbol: MatrixSymbol) {
  const prefix = `${mode.toUpperCase()}-${symbol}`;
  const price = prices[`${mode}:${symbol}`];

  return {
    anomaly: `${prefix}-ANOMALY`,
    summaryPrice: price.summary,
    timelineAnomaly: `${prefix}-TIMELINE-ANOMALY`,
    timelinePrice: price.timeline,
  };
}

export function matrixSummary(
  mode: UiMode,
  observed: readonly MatrixSymbol[] = ["BTCUSDT", "ETHUSDT"],
): DashboardSummary {
  return {
    pipeline: {
      cache_errors: 0,
      last_message_age_ms: mode === "demo" ? 101 : 202,
      parse_errors: 0,
      reconnect_attempts: 0,
      status: "healthy",
      storage_errors: 0,
    },
    recent_anomalies: observed.map((symbol, index) =>
      matrixAnomaly(mode, symbol, index),
    ),
    service: { service: "signalguard-rs", status: "ok" },
    symbols: observed.map((symbol) => matrixObservedSymbol(mode, symbol)),
  };
}

export function matrixObservedSymbol(
  mode: UiMode,
  symbol: MatrixSymbol,
): DashboardSymbolSummary {
  const sentinel = matrixSentinel(mode, symbol);

  return {
    health: {
      evaluated_at: "2026-07-20T10:00:00.000Z",
      recent_anomaly_count: 1,
      score: mode === "demo" ? (symbol === "BTCUSDT" ? 91 : 92) : symbol === "BTCUSDT" ? 81 : 82,
      status: "healthy",
    },
    state: {
      best_ask_price: sentinel.summaryPrice,
      best_bid_price: sentinel.summaryPrice,
      depth_sequence_gap_count: 0,
      last_event_age_ms: mode === "demo" ? 101 : 202,
      last_event_time: "2026-07-20T10:00:00.000Z",
      last_trade_price: sentinel.summaryPrice,
      price_change_1m_pct: symbol === "BTCUSDT" ? 1.01 : 2.02,
      spread_pct: mode === "demo" ? 0.11 : 0.22,
      trades_per_minute: symbol === "BTCUSDT" ? 11 : 22,
    },
    symbol,
  };
}

export function matrixTimeline(mode: UiMode, symbol: MatrixSymbol): MarketTimeline {
  const sentinel = matrixSentinel(mode, symbol);

  return {
    anomalies: [
      {
        ...matrixAnomaly(mode, symbol, 50),
        message: sentinel.timelineAnomaly,
      },
    ],
    points: [
      {
        last_event_age_ms: mode === "demo" ? 111 : 222,
        price: sentinel.timelinePrice,
        spread_pct: mode === "demo" ? 0.31 : 0.41,
        timestamp: "2026-07-20T10:00:00.000Z",
        trades_per_minute: symbol === "BTCUSDT" ? 31 : 41,
      },
    ],
    symbol,
  };
}

export function matrixRuntimeMode(symbols: readonly string[]): RuntimeModeResponse {
  return {
    last_error: null,
    last_started_at: "2026-07-20T10:00:00.000Z",
    last_switched_at: null,
    mode: "live",
    mode_label: "Live",
    source: "runtime",
    status: "running",
    switching_supported: false,
    symbols: [...symbols],
  };
}

function matrixAnomaly(
  mode: UiMode,
  symbol: MatrixSymbol,
  index: number,
): DashboardAnomaly {
  const sentinel = matrixSentinel(mode, symbol);
  const suffix = String(index + (mode === "demo" ? 1 : 100)).padStart(12, "0");

  return {
    anomaly_type: "spread_spike",
    created_at: "2026-07-20T10:00:00.000Z",
    event_time: "2026-07-20T10:00:00.000Z",
    id: `00000000-0000-4000-8000-${suffix}`,
    message: sentinel.anomaly,
    observed_value: symbol === "BTCUSDT" ? 1.1 : 2.2,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}
