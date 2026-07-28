// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { MarketTimelinePoint } from "./types";
import {
  normalizeTimelinePoint,
  normalizeTimelinePoints,
} from "./timelineNormalization";

const sourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/timelineNormalization.ts",
);
const source = readFileSync(sourcePath, "utf8");

function validPoint(
  overrides: Partial<MarketTimelinePoint> = {},
): MarketTimelinePoint {
  return {
    timestamp: "2026-07-20T10:00:00.000Z",
    price: "11101.0100",
    spread_pct: 0.31,
    trades_per_minute: 31,
    last_event_age_ms: 111,
    ...overrides,
  };
}

describe("normalizeTimelinePoint", () => {
  it("maps every required field and preserves exact timestamp and price strings", () => {
    const point = validPoint();

    expect(normalizeTimelinePoint(point)).toEqual({
      timestamp: "2026-07-20T10:00:00.000Z",
      timestampMs: Date.parse("2026-07-20T10:00:00.000Z"),
      price: 11101.01,
      priceLabel: "11101.0100",
      spreadPct: 0.31,
      tradesPerMinute: 31,
      lastEventAgeMs: 111,
    });
  });

  for (const { label, price, expectedPrice } of [
    { label: "zero", price: "0", expectedPrice: 0 },
    { label: "negative", price: "-12.50", expectedPrice: -12.5 },
  ] as const) {
    it(`accepts a finite ${label} price`, () => {
      expect(normalizeTimelinePoint(validPoint({ price }))).toMatchObject({
        price: expectedPrice,
        priceLabel: price,
      });
    });
  }

  for (const price of ["", " ", "\t\n"] as const) {
    it(`rejects empty price input ${JSON.stringify(price)}`, () => {
      expect(normalizeTimelinePoint(validPoint({ price }))).toBeNull();
    });
  }

  for (const price of [
    "not-a-number",
    "NaN",
    "Infinity",
    "+Infinity",
    "-Infinity",
  ] as const) {
    it(`rejects unusable price input ${price}`, () => {
      expect(normalizeTimelinePoint(validPoint({ price }))).toBeNull();
    });
  }

  it("rejects an invalid timestamp", () => {
    expect(
      normalizeTimelinePoint(validPoint({ timestamp: "not-a-timestamp" })),
    ).toBeNull();
  });

  it("preserves finite optional values including zero and negative spread", () => {
    expect(
      normalizeTimelinePoint(
        validPoint({
          spread_pct: -0.25,
          trades_per_minute: 0,
          last_event_age_ms: 0,
        }),
      ),
    ).toMatchObject({
      spreadPct: -0.25,
      tradesPerMinute: 0,
      lastEventAgeMs: 0,
    });
  });

  it("normalizes non-finite optional fields independently without dropping the point", () => {
    expect(
      normalizeTimelinePoint(
        validPoint({
          spread_pct: Number.NaN,
          trades_per_minute: Number.POSITIVE_INFINITY,
          last_event_age_ms: Number.NEGATIVE_INFINITY,
        }),
      ),
    ).toMatchObject({
      spreadPct: null,
      tradesPerMinute: null,
      lastEventAgeMs: null,
    });
  });

  it("normalizes negative trades per minute and age to null", () => {
    expect(
      normalizeTimelinePoint(
        validPoint({
          trades_per_minute: -1,
          last_event_age_ms: -1,
        }),
      ),
    ).toMatchObject({
      tradesPerMinute: null,
      lastEventAgeMs: null,
    });
  });
});

describe("normalizeTimelinePoints", () => {
  it("filters invalid points while preserving valid order and duplicates", () => {
    const points = [
      validPoint({ timestamp: "2026-07-20T10:00:02.000Z", price: "2" }),
      validPoint({ timestamp: "invalid", price: "3" }),
      validPoint({ timestamp: "2026-07-20T10:00:01.000Z", price: "1" }),
      validPoint({ timestamp: "2026-07-20T10:00:01.000Z", price: "1" }),
      validPoint({ timestamp: "2026-07-20T10:00:03.000Z", price: " " }),
    ];

    expect(
      normalizeTimelinePoints(points).map(({ timestamp, priceLabel }) => ({
        timestamp,
        priceLabel,
      })),
    ).toEqual([
      { timestamp: "2026-07-20T10:00:02.000Z", priceLabel: "2" },
      { timestamp: "2026-07-20T10:00:01.000Z", priceLabel: "1" },
      { timestamp: "2026-07-20T10:00:01.000Z", priceLabel: "1" },
    ]);
  });

  it("does not mutate input objects or the input array", () => {
    const first = Object.freeze(validPoint({ price: "1.00" }));
    const second = Object.freeze(
      validPoint({
        timestamp: "2026-07-20T10:00:01.000Z",
        price: "2.00",
      }),
    );
    const points = Object.freeze([first, second]);
    const before = JSON.stringify(points);

    const result = normalizeTimelinePoints(points);

    expect(result).not.toBe(points);
    expect(JSON.stringify(points)).toBe(before);
    expect(points[0]).toBe(first);
    expect(points[1]).toBe(second);
  });

  it("returns equal values for equal inputs", () => {
    const firstInput = [validPoint(), validPoint({ price: "22202.0200" })];
    const secondInput = firstInput.map((point) => ({ ...point }));

    expect(normalizeTimelinePoints(firstInput)).toEqual(
      normalizeTimelinePoints(secondInput),
    );
  });
});

describe("timeline normalization purity", () => {
  it("contains only the allowed type dependency and deterministic primitives", () => {
    expect(source).toMatch(
      /^import\s+type\s+\{\s*MarketTimelinePoint\s*\}\s+from\s+["']\.\/types["'];/m,
    );
    expect(source).not.toMatch(/^\s*<\/?[A-Za-z][^>]*>/m);
    expect(source).not.toMatch(/from\s+["'](?:react|recharts)["']/);
    expect(source).not.toMatch(/\buse[A-Z][A-Za-z0-9]*\b/);
    expect(source).not.toMatch(
      /\b(?:window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|Date\.now|new\s+Date|setTimeout|setInterval|Math\.random|Intl|toLocaleString|process\.env)\b/,
    );
    expect(source).not.toMatch(/\breplay\b/i);
    expect(source).not.toMatch(/(?:className|tooltip|stroke|fill|color)/i);
  });
});
