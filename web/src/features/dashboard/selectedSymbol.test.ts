import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SELECTED_SYMBOL,
  getStoredSelectedSymbol,
  normalizeSelectedSymbol,
  resolveSelectedSymbol,
  selectedSymbolStorageKey,
  storeSelectedSymbol,
  useSelectedSymbol,
} from "./selectedSymbol";
import type { UiMode } from "./types";

const LEGACY_SELECTED_SYMBOL_STORAGE_KEY = "signalguard:selected-symbol";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("normalizeSelectedSymbol", () => {
  it.each([
    ["btcusdt", "BTCUSDT"],
    ["  ethusdt  ", "ETHUSDT"],
    ["bTcUsDt", "BTCUSDT"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ] as const)("normalizes %s as %s", (value, expected) => {
    expect(normalizeSelectedSymbol(value)).toBe(expected);
  });
});

describe("mode-scoped selected-symbol storage", () => {
  it("uses distinct Demo and Live keys", () => {
    expect(selectedSymbolStorageKey("demo")).toBe(
      "signalguard:selected-symbol:demo",
    );
    expect(selectedSymbolStorageKey("live")).toBe(
      "signalguard:selected-symbol:live",
    );
    expect(selectedSymbolStorageKey("demo")).not.toBe(
      selectedSymbolStorageKey("live"),
    );
  });

  it.each([
    ["demo", "ETHUSDT", "LIVEONLY"],
    ["live", "LIVEONLY", "ETHUSDT"],
  ] as const)("reads only the %s key", (mode, expected, otherValue) => {
    const otherMode: UiMode = mode === "demo" ? "live" : "demo";
    window.localStorage.setItem(selectedSymbolStorageKey(mode), expected);
    window.localStorage.setItem(
      selectedSymbolStorageKey(otherMode),
      otherValue,
    );

    expect(getStoredSelectedSymbol(mode)).toBe(expected);
  });

  it.each([
    ["demo", "ETHUSDT", "live"],
    ["live", "LIVEONLY", "demo"],
  ] as const)(
    "writing %s does not change the other mode",
    (mode, symbol, otherMode) => {
      window.localStorage.setItem(
        selectedSymbolStorageKey(otherMode),
        "PRESERVED",
      );

      expect(storeSelectedSymbol(mode, symbol)).toBe(symbol);
      expect(window.localStorage.getItem(selectedSymbolStorageKey(mode))).toBe(
        symbol,
      );
      expect(
        window.localStorage.getItem(selectedSymbolStorageKey(otherMode)),
      ).toBe("PRESERVED");
    },
  );

  it("ignores the legacy global key", () => {
    window.localStorage.setItem(LEGACY_SELECTED_SYMBOL_STORAGE_KEY, "ETHUSDT");

    expect(getStoredSelectedSymbol("demo")).toBeNull();
    expect(getStoredSelectedSymbol("live")).toBeNull();
  });

  it("canonicalizes values before storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(storeSelectedSymbol("demo", " ethusdt ")).toBe("ETHUSDT");
    expect(setItem).toHaveBeenCalledWith(
      selectedSymbolStorageKey("demo"),
      "ETHUSDT",
    );
  });

  it("dispatches a mode-aware same-window event after a successful write", () => {
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");

    storeSelectedSymbol("live", " liveonly ");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      mode: "live",
      symbol: "LIVEONLY",
    });
  });

  it.each(["", "   ", "BTC-USDT", "ETH/USDT"])(
    "does not write invalid value %s",
    (symbol) => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      expect(storeSelectedSymbol("live", symbol)).toBeNull();
      expect(setItem).not.toHaveBeenCalled();
    },
  );

  it("returns null when localStorage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage read blocked");
    });

    expect(() => getStoredSelectedSymbol("demo")).not.toThrow();
    expect(getStoredSelectedSymbol("demo")).toBeNull();
  });

  it("returns safely when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    expect(() => storeSelectedSymbol("live", "ethusdt")).not.toThrow();
    expect(storeSelectedSymbol("live", "ethusdt")).toBe("ETHUSDT");
  });

  it("uses safe non-browser behavior", () => {
    vi.stubGlobal("window", undefined);

    expect(getStoredSelectedSymbol("demo")).toBeNull();
    expect(storeSelectedSymbol("live", " ethusdt ")).toBe("ETHUSDT");
  });
});

describe("resolveSelectedSymbol", () => {
  const availableSymbols = ["BTCUSDT", "ETHUSDT"];

  it("prefers a valid current-mode candidate", () => {
    expect(resolveSelectedSymbol(availableSymbols, "ethusdt", "BTCUSDT")).toBe(
      "ETHUSDT",
    );
  });

  it("falls back from an unavailable candidate to the stored symbol", () => {
    expect(resolveSelectedSymbol(availableSymbols, "SOLUSDT", "ethusdt")).toBe(
      "ETHUSDT",
    );
  });

  it.each(["SOLUSDT", "BTC-USDT", ""])(
    "ignores invalid or unavailable stored symbol %s",
    (storedSymbol) => {
      expect(resolveSelectedSymbol(availableSymbols, null, storedSymbol)).toBe(
        DEFAULT_SELECTED_SYMBOL,
      );
    },
  );

  it("uses the default only when it exists in the current catalog", () => {
    expect(resolveSelectedSymbol(["ETHUSDT", "BTCUSDT"], null, null)).toBe(
      "BTCUSDT",
    );
    expect(resolveSelectedSymbol(["ETHUSDT", "LIVEONLY"], null, null)).toBe(
      "ETHUSDT",
    );
  });

  it("uses the first canonical catalog symbol when the default is absent", () => {
    expect(
      resolveSelectedSymbol([" ethusdt ", "LIVEONLY"], null, null),
    ).toBe("ETHUSDT");
  });

  it("returns null for an empty or invalid catalog", () => {
    expect(resolveSelectedSymbol([], null, null)).toBeNull();
    expect(resolveSelectedSymbol(["", "BTC-USDT"], null, null)).toBeNull();
  });

  it("normalizes and deduplicates availability deterministically", () => {
    expect(
      resolveSelectedSymbol(
        [" ethusdt ", "ETHUSDT", "btcusdt", "BTCUSDT"],
        null,
        null,
      ),
    ).toBe("BTCUSDT");
    expect(
      resolveSelectedSymbol([" ethusdt ", "ETHUSDT", "LIVEONLY"], null, null),
    ).toBe("ETHUSDT");
  });
});

describe("useSelectedSymbol event and mode isolation", () => {
  it("updates a Demo subscriber for a Demo same-window change only", async () => {
    const { result } = renderHook(() =>
      useSelectedSymbol("demo", ["BTCUSDT", "ETHUSDT"]),
    );

    act(() => {
      storeSelectedSymbol("live", "LIVEONLY");
    });
    expect(result.current.selectedSymbol).toBe("BTCUSDT");

    act(() => {
      storeSelectedSymbol("demo", "ETHUSDT");
    });
    await waitFor(() => expect(result.current.selectedSymbol).toBe("ETHUSDT"));
  });

  it("updates a Live subscriber for a Live same-window change only", async () => {
    const { result } = renderHook(() =>
      useSelectedSymbol("live", ["LIVEONE", "LIVETWO"]),
    );

    act(() => {
      storeSelectedSymbol("demo", "ETHUSDT");
    });
    expect(result.current.selectedSymbol).toBe("LIVEONE");

    act(() => {
      storeSelectedSymbol("live", "LIVETWO");
    });
    await waitFor(() => expect(result.current.selectedSymbol).toBe("LIVETWO"));
  });

  it.each([
    ["demo", ["BTCUSDT", "ETHUSDT"], "ETHUSDT"],
    ["live", ["LIVEONE", "LIVETWO"], "LIVETWO"],
  ] as const)(
    "a %s hook reacts to its active storage key",
    async (mode, available, expected) => {
      const { result } = renderHook(() => useSelectedSymbol(mode, available));

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: selectedSymbolStorageKey(mode),
            newValue: expected,
          }),
        );
      });

      await waitFor(() => expect(result.current.selectedSymbol).toBe(expected));
    },
  );

  it.each([
    ["demo", "live"],
    ["live", "demo"],
  ] as const)(
    "a %s hook ignores a storage event for the %s key",
    (activeMode, otherMode) => {
      const available = activeMode === "demo"
        ? ["BTCUSDT", "ETHUSDT"]
        : ["LIVEONE", "LIVETWO"];
      const { result } = renderHook(() =>
        useSelectedSymbol(activeMode, available),
      );
      const initial = result.current.selectedSymbol;

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: selectedSymbolStorageKey(otherMode),
            newValue: otherMode === "demo" ? "ETHUSDT" : "LIVETWO",
          }),
        );
      });

      expect(result.current.selectedSymbol).toBe(initial);
    },
  );

  it("ignores a legacy-key storage event", () => {
    const { result } = renderHook(() =>
      useSelectedSymbol("demo", ["BTCUSDT", "ETHUSDT"]),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LEGACY_SELECTED_SYMBOL_STORAGE_KEY,
          newValue: "ETHUSDT",
        }),
      );
    });

    expect(result.current.selectedSymbol).toBe("BTCUSDT");
  });

  it("reloads and restores independent preferences when mode changes", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "ETHUSDT");
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "LIVETWO");

    const { result, rerender } = renderHook(
      ({ mode, symbols }: { mode: UiMode; symbols: string[] }) =>
        useSelectedSymbol(mode, symbols),
      {
        initialProps: {
          mode: "demo" as UiMode,
          symbols: ["BTCUSDT", "ETHUSDT"],
        },
      },
    );

    expect(result.current.selectedSymbol).toBe("ETHUSDT");

    rerender({ mode: "live", symbols: ["LIVEONE", "LIVETWO"] });
    expect(result.current.selectedSymbol).toBe("LIVETWO");

    act(() => {
      result.current.setSelectedSymbol("LIVEONE");
    });
    expect(result.current.selectedSymbol).toBe("LIVEONE");

    rerender({ mode: "demo", symbols: ["BTCUSDT", "ETHUSDT"] });
    expect(result.current.selectedSymbol).toBe("ETHUSDT");

    rerender({ mode: "live", symbols: ["LIVEONE", "LIVETWO"] });
    await waitFor(() => expect(result.current.selectedSymbol).toBe("LIVEONE"));
  });

  it("does not leak a Demo-only or Live-only stored symbol across modes", () => {
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "ETHUSDT");
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "LIVEONLY");

    const { result: liveResult } = renderHook(() =>
      useSelectedSymbol("live", ["LIVEONLY"]),
    );
    const { result: demoResult } = renderHook(() =>
      useSelectedSymbol("demo", ["BTCUSDT", "ETHUSDT"]),
    );

    expect(liveResult.current.selectedSymbol).toBe("LIVEONLY");
    expect(demoResult.current.selectedSymbol).toBe("ETHUSDT");
  });

  it("represents an empty Live catalog without a fabricated market", () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");

    const { result } = renderHook(() => useSelectedSymbol("live", []));

    expect(result.current.selectedSymbol).toBeNull();
  });
});
