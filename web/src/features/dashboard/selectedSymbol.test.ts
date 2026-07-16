import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SELECTED_SYMBOL,
  getStoredSelectedSymbol,
  normalizeSelectedSymbol,
  resolveSelectedSymbol,
  SELECTED_SYMBOL_STORAGE_KEY,
  storeSelectedSymbol,
} from "./selectedSymbol";

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

describe("stored selected symbol", () => {
  it("normalizes a valid stored value", () => {
    window.localStorage.setItem(SELECTED_SYMBOL_STORAGE_KEY, "  ethusdt ");

    expect(getStoredSelectedSymbol()).toBe("ETHUSDT");
  });

  it("returns null for blank or absent stored values", () => {
    window.localStorage.setItem(SELECTED_SYMBOL_STORAGE_KEY, "   ");
    expect(getStoredSelectedSymbol()).toBeNull();

    window.localStorage.removeItem(SELECTED_SYMBOL_STORAGE_KEY);
    expect(getStoredSelectedSymbol()).toBeNull();
  });

  it("returns null when localStorage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage read blocked");
    });

    expect(() => getStoredSelectedSymbol()).not.toThrow();
    expect(getStoredSelectedSymbol()).toBeNull();
  });

  it("stores the normalized value", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(storeSelectedSymbol(" ethusdt ")).toBe("ETHUSDT");
    expect(setItem).toHaveBeenCalledWith(
      SELECTED_SYMBOL_STORAGE_KEY,
      "ETHUSDT",
    );
  });

  it("does not write a blank symbol", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(storeSelectedSymbol("   ")).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("returns safely when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    expect(() => storeSelectedSymbol("ethusdt")).not.toThrow();
    expect(storeSelectedSymbol("ethusdt")).toBe("ETHUSDT");
  });

  it("uses safe non-browser behavior", () => {
    vi.stubGlobal("window", undefined);

    expect(getStoredSelectedSymbol()).toBeNull();
    expect(storeSelectedSymbol(" ethusdt ")).toBe("ETHUSDT");
  });
});

describe("resolveSelectedSymbol", () => {
  const availableSymbols = ["BTCUSDT", "ETHUSDT"];

  it("prefers a valid candidate over a valid stored symbol", () => {
    expect(resolveSelectedSymbol(availableSymbols, "ethusdt", "BTCUSDT")).toBe(
      "ETHUSDT",
    );
  });

  it("falls back from an unavailable candidate to a valid stored symbol", () => {
    expect(resolveSelectedSymbol(availableSymbols, "SOLUSDT", "ethusdt")).toBe(
      "ETHUSDT",
    );
  });

  it("ignores an unavailable stored symbol", () => {
    expect(resolveSelectedSymbol(availableSymbols, null, "SOLUSDT")).toBe(
      DEFAULT_SELECTED_SYMBOL,
    );
  });

  it("selects BTCUSDT deterministically when it is genuinely available", () => {
    expect(resolveSelectedSymbol(["ETHUSDT", "BTCUSDT"], null, null)).toBe(
      "BTCUSDT",
    );
  });

  it("normalizes available symbols, the candidate, and the stored symbol", () => {
    expect(
      resolveSelectedSymbol([" btcusdt ", " ethusdt "], " eThUsDt ", "btcusdt"),
    ).toBe("ETHUSDT");
  });

  it("keeps duplicate and case-variant availability deterministic", () => {
    const firstOrder = [" ethusdt ", "ETHUSDT", "btcusdt", "BTCUSDT"];
    const secondOrder = [...firstOrder].reverse();

    expect(resolveSelectedSymbol(firstOrder, "eThUsDt", null)).toBe("ETHUSDT");
    expect(resolveSelectedSymbol(secondOrder, "eThUsDt", null)).toBe("ETHUSDT");
  });
});
