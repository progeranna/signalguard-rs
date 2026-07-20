import { parseSymbolId, type SymbolId } from "./symbolId";
import type { UiMode } from "./types";

export type SymbolPopupReturnContext =
  | "dashboard"
  | "symbols"
  | "anomalies";

export type SymbolPopupIdentity = Readonly<{
  mode: UiMode;
  symbol: SymbolId;
  returnContext: SymbolPopupReturnContext;
}>;

export function createSymbolPopupIdentity(
  mode: UiMode,
  symbol: string | null | undefined,
  returnContext: SymbolPopupReturnContext,
): SymbolPopupIdentity | null {
  const symbolId = parseSymbolId(symbol);

  return symbolId ? { mode, symbol: symbolId, returnContext } : null;
}

export function replaceSymbolPopupSymbol(
  identity: SymbolPopupIdentity,
  symbol: string | null | undefined,
): SymbolPopupIdentity | null {
  return createSymbolPopupIdentity(
    identity.mode,
    symbol,
    identity.returnContext,
  );
}

export function replaceSymbolPopupMode(
  identity: SymbolPopupIdentity,
  mode: UiMode,
): SymbolPopupIdentity {
  return {
    ...identity,
    mode,
  };
}

export function symbolPopupIdentityKey(
  identity: SymbolPopupIdentity,
): string {
  return `${identity.mode}:${identity.symbol}:${identity.returnContext}`;
}
