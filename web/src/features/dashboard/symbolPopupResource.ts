import { useCatalogDashboardSummaryQuery } from "./api";
import { isDashboardSymbolPlaceholder } from "./marketOrder";
import { parseSymbolId } from "./symbolId";
import type { SymbolPopupIdentity } from "./symbolPopup";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  UiMode,
} from "./types";

export type SymbolPopupResourceData = {
  anomalies: DashboardAnomaly[];
  mode: UiMode;
  summary: DashboardSymbolSummary;
  symbol: SymbolPopupIdentity["symbol"];
};

type PopupSummaryQueryState = {
  data: DashboardSummary | null | undefined;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
};

export type SymbolPopupResourceState =
  | {
      error: unknown;
      identity: SymbolPopupIdentity;
      refetch: () => Promise<unknown>;
      status: "error";
    }
  | {
      identity: SymbolPopupIdentity;
      refetch: () => Promise<unknown>;
      status: "loading";
    }
  | {
      identity: SymbolPopupIdentity;
      refetch: () => Promise<unknown>;
      status: "unavailable";
    }
  | {
      identity: SymbolPopupIdentity;
      refetch: () => Promise<unknown>;
      resource: SymbolPopupResourceData;
      status: "success";
    };

export function resolveSymbolPopupResource(
  identity: SymbolPopupIdentity,
  query: PopupSummaryQueryState,
): SymbolPopupResourceState {
  if (query.isLoading && !query.data) {
    return { identity, refetch: query.refetch, status: "loading" };
  }

  if (query.isError && !query.data) {
    return {
      error: query.error,
      identity,
      refetch: query.refetch,
      status: "error",
    };
  }

  const selectedSummary = query.data?.symbols.find(
    (entry) => parseSymbolId(entry.symbol) === identity.symbol,
  );

  if (!selectedSummary || isDashboardSymbolPlaceholder(selectedSummary)) {
    return { identity, refetch: query.refetch, status: "unavailable" };
  }

  const responseSymbol = parseSymbolId(selectedSummary.symbol);

  if (responseSymbol !== identity.symbol) {
    throw new TypeError(
      `popup resource symbol mismatch: requested ${identity.symbol}, received ${selectedSummary.symbol}`,
    );
  }

  return {
    identity,
    refetch: query.refetch,
    resource: {
      anomalies: (query.data?.recent_anomalies ?? []).filter(
        (anomaly) => parseSymbolId(anomaly.symbol) === identity.symbol,
      ),
      mode: identity.mode,
      summary: {
        ...selectedSummary,
        symbol: responseSymbol,
      },
      symbol: responseSymbol,
    },
    status: "success",
  };
}

export function useSymbolPopupResource(
  identity: SymbolPopupIdentity,
): SymbolPopupResourceState {
  const query = useCatalogDashboardSummaryQuery(identity.mode);

  return resolveSymbolPopupResource(identity, {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    refetch: async () => query.refetch(),
  });
}
