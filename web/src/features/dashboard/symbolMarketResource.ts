import { isApiError } from "@/shared/api/errors";

import {
  useDashboardSummaryQuery,
  useMarketAnomaliesQuery,
  useMarketHealthQuery,
  useMarketStateQuery,
  useMarketTimelineQuery,
} from "./api";
import { isDashboardSymbolPlaceholder } from "./marketOrder";
import { parseSymbolId, type SymbolId } from "./symbolId";
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

export type SymbolMarketIdentity = {
  mode: UiMode;
  symbol: SymbolId | null;
  summary?: DashboardSymbolSummary;
};

export type SymbolMarketResourceData = {
  anomalies: DashboardAnomaly[];
  mode: UiMode;
  summary: DashboardSymbolSummary;
  symbol: SymbolId;
};

type ResourceQueryState<T> = {
  data: T | null | undefined;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};

export type SymbolMarketQueryBundle = {
  anomalies: ResourceQueryState<AnomaliesResponse>;
  demoSummary: ResourceQueryState<DashboardSummary>;
  health: ResourceQueryState<MarketHealth>;
  state: ResourceQueryState<MarketState>;
  timeline: ResourceQueryState<MarketTimeline>;
};

export type SymbolMarketResourceState =
  | {
      error: unknown;
      identity: SymbolMarketIdentity;
      refetch: () => Promise<unknown>;
      status: "error";
    }
  | {
      identity: SymbolMarketIdentity;
      refetch: () => Promise<unknown>;
      status: "loading";
    }
  | {
      identity: SymbolMarketIdentity;
      refetch: () => Promise<unknown>;
      status: "unavailable";
    }
  | {
      identity: SymbolMarketIdentity;
      refetch: () => Promise<unknown>;
      resource: SymbolMarketResourceData;
      status: "success";
    };

function demoQueries(queries: SymbolMarketQueryBundle) {
  return [queries.demoSummary, queries.timeline] as const;
}

function liveQueries(queries: SymbolMarketQueryBundle) {
  return [queries.state, queries.health, queries.anomalies] as const;
}

function queryErrorWithoutData(query: ResourceQueryState<unknown>): boolean {
  return query.isError && query.data == null;
}

function queryLoadingWithoutData(query: ResourceQueryState<unknown>): boolean {
  return query.isLoading && query.data == null;
}

function queryNotFoundWithoutData(query: ResourceQueryState<unknown>): boolean {
  const error = query.error;

  return queryErrorWithoutData(query) && isApiError(error) && error.status === 404;
}

function responseSymbol(
  requestedSymbol: SymbolId,
  receivedSymbol: string,
  resourceFamily: string,
): SymbolId {
  const symbol = parseSymbolId(receivedSymbol);

  if (symbol !== requestedSymbol) {
    throw new TypeError(
      `${resourceFamily} resource symbol mismatch: requested ${requestedSymbol}, received ${receivedSymbol}`,
    );
  }

  return symbol;
}

function refetchForMode(
  mode: UiMode,
  queries: SymbolMarketQueryBundle,
): () => Promise<unknown> {
  const relevantQueries = mode === "demo" ? demoQueries(queries) : liveQueries(queries);

  return async () => Promise.all(relevantQueries.map((query) => query.refetch()));
}

export function resolveSymbolMarketResource(
  identity: SymbolMarketIdentity,
  queries: SymbolMarketQueryBundle,
): SymbolMarketResourceState {
  const refetch = refetchForMode(identity.mode, queries);

  if (!identity.symbol) {
    return { identity, refetch, status: "unavailable" };
  }

  const relevantQueries =
    identity.mode === "demo" ? demoQueries(queries) : liveQueries(queries);

  if (relevantQueries.some(queryLoadingWithoutData)) {
    return { identity, refetch, status: "loading" };
  }

  if (identity.mode === "live") {
    if (queryLoadingWithoutData(queries.demoSummary)) {
      return { identity, refetch, status: "loading" };
    }
    const selectedSummary = queries.demoSummary.data?.symbols.find(
      (entry) => parseSymbolId(entry.symbol) === identity.symbol,
    ) ?? identity.summary;
    if (selectedSummary && selectedSummary.availability !== "observed") {
      return {
        identity,
        refetch,
        resource: { anomalies: [], mode: identity.mode, summary: selectedSummary, symbol: identity.symbol },
        status: "success",
      };
    }
    if (relevantQueries.some(queryNotFoundWithoutData)) {
      return { identity, refetch, status: "unavailable" };
    }
  }

  const failedQuery = relevantQueries.find(queryErrorWithoutData);
  if (failedQuery) {
    return {
      error: failedQuery.error,
      identity,
      refetch,
      status: "error",
    };
  }

  if (identity.mode === "demo") {
    const selectedSummary = queries.demoSummary.data?.symbols.find(
      (entry) => parseSymbolId(entry.symbol) === identity.symbol,
    );
    const timeline = queries.timeline.data;

    if (
      !selectedSummary ||
      isDashboardSymbolPlaceholder(selectedSummary) ||
      !timeline
    ) {
      return { identity, refetch, status: "unavailable" };
    }

    const symbol = responseSymbol(identity.symbol, timeline.symbol, "timeline");

    return {
      identity,
      refetch,
      resource: {
        anomalies: timeline.anomalies,
        mode: identity.mode,
        summary: {
          ...selectedSummary,
          symbol,
        },
        symbol,
      },
      status: "success",
    };
  }

  const state = queries.state.data;
  const health = queries.health.data;
  const anomalies = queries.anomalies.data;

  if (!state || !health || !anomalies) {
    return { identity, refetch, status: "unavailable" };
  }

  const stateSymbol = responseSymbol(identity.symbol, state.symbol, "state");
  responseSymbol(identity.symbol, health.symbol, "health");
  for (const anomaly of anomalies.anomalies) {
    responseSymbol(identity.symbol, anomaly.symbol, "anomaly");
  }

  return {
    identity,
    refetch,
    resource: {
      anomalies: anomalies.anomalies,
      mode: identity.mode,
        summary: {
          source: identity.mode,
          availability: "observed",
          health: {
          evaluated_at: health.evaluated_at,
          recent_anomaly_count: health.recent_anomaly_count,
          score: health.score,
          status: health.status,
        },
        state: {
          best_ask_price: state.best_ask_price,
          best_bid_price: state.best_bid_price,
          depth_sequence_gap_count: state.depth_sequence_gap_count,
          last_event_age_ms: state.last_event_age_ms,
          last_event_time: state.last_event_time,
          last_trade_price: state.last_trade_price,
          price_change_1m_pct: state.price_change_1m_pct,
          spread_pct: state.spread_pct,
          trades_per_minute: state.trades_per_minute,
        },
        symbol: stateSymbol,
      },
      symbol: stateSymbol,
    },
    status: "success",
  };
}

export function useSymbolMarketResource(
  identity: SymbolMarketIdentity,
): SymbolMarketResourceState {
  const demoSummaryQuery = useDashboardSummaryQuery(identity.mode, identity.mode === "demo" && identity.symbol !== null);
  const timelineQuery = useMarketTimelineQuery(
    identity.symbol,
    identity.mode,
    identity.mode === "demo",
  );
  const selectedSummary = demoSummaryQuery.data?.symbols.find(
    (entry) => parseSymbolId(entry.symbol) === identity.symbol,
  ) ?? identity.summary;
  const observed = identity.mode === "live" && (selectedSummary === undefined || selectedSummary.availability === "observed");
  const stateQuery = useMarketStateQuery(identity.symbol, identity.mode, observed);
  const healthQuery = useMarketHealthQuery(identity.symbol, identity.mode, observed);
  const anomaliesQuery = useMarketAnomaliesQuery(identity.symbol, identity.mode, 50, observed);

  return resolveSymbolMarketResource(identity, {
    anomalies: anomaliesQuery,
    demoSummary: demoSummaryQuery,
    health: healthQuery,
    state: stateQuery,
    timeline: timelineQuery,
  });
}
