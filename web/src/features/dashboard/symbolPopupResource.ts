import type { SymbolPopupIdentity } from "./symbolPopup";
import type { DashboardSymbolSummary } from "./types";
import {
  resolveSymbolMarketResource,
  useSymbolMarketResource,
  type SymbolMarketQueryBundle,
  type SymbolMarketResourceData,
  type SymbolMarketResourceState,
} from "./symbolMarketResource";

export type SymbolPopupResourceData = SymbolMarketResourceData;
export type PopupSymbolQueryBundle = SymbolMarketQueryBundle;
type PopupResourceIdentity = SymbolPopupIdentity & { summary?: DashboardSymbolSummary };

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

function attachPopupIdentity(
  identity: SymbolPopupIdentity,
  state: SymbolMarketResourceState,
): SymbolPopupResourceState {
  return { ...state, identity } as SymbolPopupResourceState;
}

export function resolveSymbolPopupResource(
  identity: PopupResourceIdentity,
  queries: PopupSymbolQueryBundle,
): SymbolPopupResourceState {
  return attachPopupIdentity(
    identity,
    resolveSymbolMarketResource(
      { mode: identity.mode, symbol: identity.symbol, summary: identity.summary },
      queries,
    ),
  );
}

export function useSymbolPopupResource(
  identity: SymbolPopupIdentity,
  summary?: DashboardSymbolSummary,
): SymbolPopupResourceState {
  const state = useSymbolMarketResource({
    mode: identity.mode,
    symbol: identity.symbol,
    summary,
  });

  return attachPopupIdentity(identity, state);
}
