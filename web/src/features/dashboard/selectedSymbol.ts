import { useCallback, useEffect, useMemo, useState } from "react";

export const SELECTED_SYMBOL_STORAGE_KEY = "signalguard:selected-symbol";
export const DEFAULT_SELECTED_SYMBOL = "BTCUSDT";

const selectedSymbolChangeEvent = "signalguard:selected-symbol-change";

export function normalizeSelectedSymbol(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();

  return normalized ? normalized : null;
}

export function getStoredSelectedSymbol(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeSelectedSymbol(window.localStorage.getItem(SELECTED_SYMBOL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeSelectedSymbol(symbol: string): string | null {
  const normalized = normalizeSelectedSymbol(symbol);

  if (!normalized || typeof window === "undefined") {
    return normalized;
  }

  try {
    window.localStorage.setItem(SELECTED_SYMBOL_STORAGE_KEY, normalized);
    window.dispatchEvent(
      new CustomEvent(selectedSymbolChangeEvent, { detail: normalized }),
    );
  } catch {
    return normalized;
  }

  return normalized;
}

export function resolveSelectedSymbol(
  availableSymbols: string[],
  candidate?: string | null,
  storedSymbol: string | null = getStoredSelectedSymbol(),
): string {
  const normalizedAvailable = availableSymbols
    .map((symbol) => normalizeSelectedSymbol(symbol))
    .filter((symbol): symbol is string => symbol !== null);
  const availableSet = new Set(normalizedAvailable);
  const normalizedCandidate = normalizeSelectedSymbol(candidate);
  const normalizedStoredSymbol = normalizeSelectedSymbol(storedSymbol);

  if (normalizedCandidate && availableSet.has(normalizedCandidate)) {
    return normalizedCandidate;
  }

  if (normalizedStoredSymbol && availableSet.has(normalizedStoredSymbol)) {
    return normalizedStoredSymbol;
  }

  if (availableSet.has(DEFAULT_SELECTED_SYMBOL)) {
    return DEFAULT_SELECTED_SYMBOL;
  }

  return normalizedAvailable[0] ?? DEFAULT_SELECTED_SYMBOL;
}

export function useSelectedSymbol(
  availableSymbols: string[] = [],
  candidate?: string | null,
) {
  const [storedSymbol, setStoredSymbol] = useState(getStoredSelectedSymbol);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === SELECTED_SYMBOL_STORAGE_KEY) {
        setStoredSymbol(normalizeSelectedSymbol(event.newValue));
      }
    }

    function handleSelectedSymbolChange(event: Event) {
      const nextSymbol =
        event instanceof CustomEvent ? normalizeSelectedSymbol(event.detail) : null;

      setStoredSymbol(nextSymbol ?? getStoredSelectedSymbol());
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(selectedSymbolChangeEvent, handleSelectedSymbolChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(selectedSymbolChangeEvent, handleSelectedSymbolChange);
    };
  }, []);

  const selectedSymbol = useMemo(
    () => resolveSelectedSymbol(availableSymbols, candidate, storedSymbol),
    [availableSymbols, candidate, storedSymbol],
  );
  const setSelectedSymbol = useCallback((symbol: string) => {
    const nextSymbol = storeSelectedSymbol(symbol);
    setStoredSymbol(nextSymbol);
  }, []);

  return { selectedSymbol, setSelectedSymbol };
}
