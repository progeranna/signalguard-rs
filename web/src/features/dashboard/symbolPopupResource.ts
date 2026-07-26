import type { SymbolPopupIdentity } from "./symbolPopup";
import {
  resolveSymbolMarketResource,
  useSymbolMarketResource,
  type SymbolMarketQueryBundle,
  type SymbolMarketResourceData,
  type SymbolMarketResourceState,
} from "./symbolMarketResource";

export type SymbolPopupResourceData = SymbolMarketResourceData;
export type PopupSymbolQueryBundle = SymbolMarketQueryBundle;

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
  identity: SymbolPopupIdentity,
  queries: PopupSymbolQueryBundle,
): SymbolPopupResourceState {
  return attachPopupIdentity(
    identity,
    resolveSymbolMarketResource(
      { mode: identity.mode, symbol: identity.symbol },
      queries,
    ),
  );
}

export function useSymbolPopupResource(
  identity: SymbolPopupIdentity,
): SymbolPopupResourceState {
  const state = useSymbolMarketResource({
    mode: identity.mode,
    symbol: identity.symbol,
  });

  return attachPopupIdentity(identity, state);
}
