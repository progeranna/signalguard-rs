const SYMBOL_ID_PATTERN = /^[A-Z0-9]+$/;

declare const symbolIdBrand: unique symbol;

export type SymbolId = string & { readonly [symbolIdBrand]: true };

export const DEFAULT_SYMBOL_ID = "BTCUSDT" as SymbolId;

export function parseSymbolId(value: string | null | undefined): SymbolId | null {
  const normalized = value?.trim().toUpperCase();

  if (!normalized || !SYMBOL_ID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized as SymbolId;
}

export function requireSymbolId(value: string | null | undefined): SymbolId {
  const symbolId = parseSymbolId(value);

  if (!symbolId) {
    throw new TypeError("symbol must contain only ASCII letters and digits");
  }

  return symbolId;
}
