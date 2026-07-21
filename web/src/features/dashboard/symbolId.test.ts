import { describe, expect, it } from "vitest";

import { orderMarkets } from "./marketOrder";
import { parseSymbolId, requireSymbolId } from "./symbolId";

describe("parseSymbolId", () => {
  it.each([
    ["btcusdt", "BTCUSDT"],
    ["  eThUsDt  ", "ETHUSDT"],
    ["SOL1USDT", "SOL1USDT"],
  ] as const)("normalizes %s as %s", (value, expected) => {
    expect(parseSymbolId(value)).toBe(expected);
  });

  it.each(["", "   ", "BTC-USDT", "BTC/USDT", "BTC_USDT", "БТКUSDT"])(
    "rejects invalid symbol %s",
    (value) => {
      expect(parseSymbolId(value)).toBeNull();
    },
  );

  it("gives equivalent spellings one identity", () => {
    expect(parseSymbolId(" btcusdt ")).toBe(parseSymbolId("BTCUSDT"));
  });
});

describe("requireSymbolId", () => {
  it("returns the canonical identity", () => {
    expect(requireSymbolId("ethusdt")).toBe("ETHUSDT");
  });

  it("fails safely for unsupported input", () => {
    expect(() => requireSymbolId("BTC-USDT")).toThrow(
      "symbol must contain only ASCII letters and digits",
    );
  });
});

describe("canonical market ordering", () => {
  it("deduplicates and canonicalizes extra market spellings", () => {
    const ordered = orderMarkets([" linkusdt ", "LINKUSDT"]);

    expect(ordered.filter((symbol) => symbol === "LINKUSDT")).toHaveLength(1);
    expect(ordered).not.toContain(" linkusdt ");
  });
});
