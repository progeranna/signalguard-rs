import { describe, expect, it } from "vitest";

import {
  createSymbolPopupIdentity,
  replaceSymbolPopupMode,
  replaceSymbolPopupSymbol,
  symbolPopupIdentityKey,
} from "./symbolPopup";

describe("symbol popup identity", () => {
  it("creates a canonical direct-dashboard identity", () => {
    expect(
      createSymbolPopupIdentity("demo", " btcusdt ", "dashboard"),
    ).toEqual({
      mode: "demo",
      returnContext: "dashboard",
      symbol: "BTCUSDT",
    });
  });

  it.each([
    ["symbols", "ETHUSDT"],
    ["anomalies", "BTCUSDT"],
  ] as const)("creates an explicit %s return context", (returnContext, symbol) => {
    expect(
      createSymbolPopupIdentity("live", symbol, returnContext),
    ).toEqual({
      mode: "live",
      returnContext,
      symbol,
    });
  });

  it.each(["BTC-USDT", "BTC/USDT", "", "   "])(
    "rejects malformed symbol identity %j",
    (symbol) => {
      expect(
        createSymbolPopupIdentity("demo", symbol, "dashboard"),
      ).toBeNull();
    },
  );

  it("preserves return context when the symbol changes", () => {
    const identity = createSymbolPopupIdentity(
      "live",
      "BTCUSDT",
      "anomalies",
    );

    expect(identity).not.toBeNull();
    expect(replaceSymbolPopupSymbol(identity!, " ethusdt ")).toEqual({
      mode: "live",
      returnContext: "anomalies",
      symbol: "ETHUSDT",
    });
  });

  it("preserves symbol and return context when the mode changes", () => {
    const identity = createSymbolPopupIdentity(
      "demo",
      "BTCUSDT",
      "symbols",
    );

    expect(identity).not.toBeNull();
    expect(replaceSymbolPopupMode(identity!, "live")).toEqual({
      mode: "live",
      returnContext: "symbols",
      symbol: "BTCUSDT",
    });
  });

  it("uses mode, symbol, and return context in the transient key", () => {
    const identity = createSymbolPopupIdentity(
      "demo",
      "BTCUSDT",
      "dashboard",
    );

    expect(identity).not.toBeNull();
    expect(symbolPopupIdentityKey(identity!)).toBe(
      "demo:BTCUSDT:dashboard",
    );
  });
});
