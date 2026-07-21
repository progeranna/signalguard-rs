import { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_SYMBOL_ID, parseSymbolId, type SymbolId } from "./symbolId";
import type { UiMode } from "./types";

export { parseSymbolId as normalizeSelectedSymbol } from "./symbolId";

export const DEFAULT_SELECTED_SYMBOL = DEFAULT_SYMBOL_ID;

const LEGACY_SELECTED_SYMBOL_STORAGE_KEY = "signalguard:selected-symbol";
const SELECTED_SYMBOL_STORAGE_KEY_ROOT = LEGACY_SELECTED_SYMBOL_STORAGE_KEY;
const selectedSymbolChangeEvent = "signalguard:selected-symbol-change";

type SelectedSymbolChangeDetail = {
  mode: UiMode;
  symbol: SymbolId;
};

type StoredSelectionState = {
  mode: UiMode;
  symbol: SymbolId | null;
};

export function selectedSymbolStorageKey(mode: UiMode): string {
  return `${SELECTED_SYMBOL_STORAGE_KEY_ROOT}:${mode}`;
}

export function getStoredSelectedSymbol(mode: UiMode): SymbolId | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseSymbolId(window.localStorage.getItem(selectedSymbolStorageKey(mode)));
  } catch {
    return null;
  }
}

export function storeSelectedSymbol(
  mode: UiMode,
  symbol: string,
): SymbolId | null {
  const normalized = parseSymbolId(symbol);

  if (!normalized || typeof window === "undefined") {
    return normalized;
  }

  try {
    window.localStorage.setItem(selectedSymbolStorageKey(mode), normalized);
    window.dispatchEvent(
      new CustomEvent<SelectedSymbolChangeDetail>(selectedSymbolChangeEvent, {
        detail: { mode, symbol: normalized },
      }),
    );
  } catch {
    return normalized;
  }

  return normalized;
}

export function resolveSelectedSymbol(
  availableSymbols: readonly string[],
  candidate?: string | null,
  storedSymbol: string | null = null,
): SymbolId | null {
  const normalizedAvailable: SymbolId[] = [];
  const availableSet = new Set<SymbolId>();

  for (const symbol of availableSymbols) {
    const normalized = parseSymbolId(symbol);

    if (!normalized || availableSet.has(normalized)) {
      continue;
    }

    availableSet.add(normalized);
    normalizedAvailable.push(normalized);
  }

  const normalizedCandidate = parseSymbolId(candidate);
  const normalizedStoredSymbol = parseSymbolId(storedSymbol);

  if (normalizedCandidate && availableSet.has(normalizedCandidate)) {
    return normalizedCandidate;
  }

  if (normalizedStoredSymbol && availableSet.has(normalizedStoredSymbol)) {
    return normalizedStoredSymbol;
  }

  if (availableSet.has(DEFAULT_SELECTED_SYMBOL)) {
    return DEFAULT_SELECTED_SYMBOL;
  }

  return normalizedAvailable[0] ?? null;
}

export function useSelectedSymbol(
  mode: UiMode,
  availableSymbols: readonly string[] = [],
  candidate?: string | null,
) {
  const [storedSelection, setStoredSelection] = useState<StoredSelectionState>(
    () => ({ mode, symbol: getStoredSelectedSymbol(mode) }),
  );
  const storedSymbol =
    storedSelection.mode === mode
      ? storedSelection.symbol
      : getStoredSelectedSymbol(mode);

  useEffect(() => {
    setStoredSelection({ mode, symbol: getStoredSelectedSymbol(mode) });
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const storageKey = selectedSymbolStorageKey(mode);

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) {
        setStoredSelection({ mode, symbol: parseSymbolId(event.newValue) });
      }
    }

    function handleSelectedSymbolChange(event: Event) {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail as Partial<SelectedSymbolChangeDetail> | null;

      if (detail?.mode !== mode) {
        return;
      }

      const nextSymbol = parseSymbolId(detail.symbol);
      setStoredSelection({
        mode,
        symbol: nextSymbol ?? getStoredSelectedSymbol(mode),
      });
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(selectedSymbolChangeEvent, handleSelectedSymbolChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(selectedSymbolChangeEvent, handleSelectedSymbolChange);
    };
  }, [mode]);

  const selectedSymbol = useMemo(
    () => resolveSelectedSymbol(availableSymbols, candidate, storedSymbol),
    [availableSymbols, candidate, storedSymbol],
  );
  const setSelectedSymbol = useCallback(
    (symbol: string) => {
      const nextSymbol = storeSelectedSymbol(mode, symbol);
      setStoredSelection({ mode, symbol: nextSymbol });

      return nextSymbol;
    },
    [mode],
  );

  return { selectedSymbol, setSelectedSymbol };
}
