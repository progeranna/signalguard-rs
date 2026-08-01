// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { NormalizedTimelinePoint } from "./timelineNormalization";
import {
  buildTimelineDomains,
  buildTimelinePriceDomain,
  buildTimelineTimeDomain,
  type TimelineNumericDomain,
} from "./timelineDomains";

const sourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/timelineDomains.ts",
);
const source = readFileSync(sourcePath, "utf8");

function staticImportSpecifiers(value: string): string[] {
  return Array.from(
    value.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    (match) => match[1],
  );
}

function runtimeImportSpecifiers(value: string): string[] {
  const withoutTypeImports = value.replace(
    /^\s*import\s+type\b[\s\S]*?;\s*$/gm,
    "",
  );

  return staticImportSpecifiers(withoutTypeImports);
}

function timelinePoint(
  price: number,
  timestampMs: number,
): NormalizedTimelinePoint {
  return {
    timestamp: "2026-07-20T10:00:00.000Z",
    timestampMs,
    price,
    priceLabel: String(price),
    spreadPct: null,
    tradesPerMinute: null,
    lastEventAgeMs: null,
  };
}

function expectFiniteAscending(domain: TimelineNumericDomain): void {
  expect(Number.isFinite(domain[0])).toBe(true);
  expect(Number.isFinite(domain[1])).toBe(true);
  expect(domain[0]).toBeLessThan(domain[1]);
}

function expectExactRangeError(run: () => unknown, message: string): void {
  try {
    run();
    throw new Error("expected RangeError");
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect((error as RangeError).message).toBe(message);
  }
}

describe("buildTimelinePriceDomain", () => {
  it("returns the exact empty price domain", () => {
    expect(buildTimelinePriceDomain([])).toEqual([0, 1]);
  });

  it("applies the exact positive-price padding formula", () => {
    const points = [timelinePoint(100, 1), timelinePoint(120, 2)];

    expect(buildTimelinePriceDomain(points)).toEqual([98.4, 121.6]);
  });

  it("gives zero-only input finite strict minimum padding", () => {
    const domain = buildTimelinePriceDomain([timelinePoint(0, 1)]);

    expect(domain).toEqual([-0.01, 0.01]);
    expectFiniteAscending(domain);
  });

  it("uses magnitude padding for a single non-zero price", () => {
    const domain = buildTimelinePriceDomain([timelinePoint(10, 1)]);

    expect(domain).toEqual([9.98, 10.02]);
    expectFiniteAscending(domain);
  });

  it("supports negative prices using global minimum and maximum", () => {
    expect(
      buildTimelinePriceDomain([
        timelinePoint(-100, 1),
        timelinePoint(-200, 2),
      ]),
    ).toEqual([-208, -92]);
  });

  it("supports mixed-sign prices using range and magnitude", () => {
    expect(
      buildTimelinePriceDomain([
        timelinePoint(20, 1),
        timelinePoint(-10, 2),
      ]),
    ).toEqual([-12.4, 22.4]);
  });

  it("is independent of input order", () => {
    const ordered = [
      timelinePoint(-10, 1),
      timelinePoint(5, 2),
      timelinePoint(20, 3),
    ];
    const outOfOrder = [ordered[2], ordered[0], ordered[1]];

    expect(buildTimelinePriceDomain(outOfOrder)).toEqual(
      buildTimelinePriceDomain(ordered),
    );
  });

  it("permits duplicate prices without changing the domain policy", () => {
    const point = timelinePoint(25, 1);

    expect(buildTimelinePriceDomain([point, { ...point }])).toEqual(
      buildTimelinePriceDomain([point]),
    );
  });

  it("throws the exact error when derived bounds overflow", () => {
    expectExactRangeError(
      () => buildTimelinePriceDomain([timelinePoint(Number.MAX_VALUE, 1)]),
      "timeline price domain exceeds finite numeric bounds",
    );
  });
});

describe("buildTimelineTimeDomain", () => {
  it("uses the supplied empty anchor exactly without reading current time", () => {
    const currentTime = vi.spyOn(Date, "now").mockReturnValue(999_999_999);

    try {
      expect(buildTimelineTimeDomain([], 120_000)).toEqual([60_000, 120_000]);
      expect(currentTime).not.toHaveBeenCalled();
    } finally {
      currentTime.mockRestore();
    }
  });

  for (const anchor of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_VALUE,
  ]) {
    it(`throws the exact empty-anchor error for ${String(anchor)}`, () => {
      expectExactRangeError(
        () => buildTimelineTimeDomain([], anchor),
        "timeline empty time-domain anchor must produce finite bounds",
      );
    });
  }

  it("expands one timestamp by exactly 60 seconds on each side", () => {
    expect(buildTimelineTimeDomain([timelinePoint(1, 120_000)], 0)).toEqual([
      60_000,
      180_000,
    ]);
  });

  it("uses the same expansion for duplicate equal timestamps", () => {
    expect(
      buildTimelineTimeDomain(
        [timelinePoint(1, 120_000), timelinePoint(2, 120_000)],
        0,
      ),
    ).toEqual([60_000, 180_000]);
  });

  it("returns global minimum and maximum for distinct out-of-order timestamps", () => {
    expect(
      buildTimelineTimeDomain(
        [timelinePoint(1, 300_000), timelinePoint(2, 100_000), timelinePoint(3, 200_000)],
        Number.NaN,
      ),
    ).toEqual([100_000, 300_000]);
  });

  it("ignores the empty anchor for non-empty input", () => {
    expect(
      buildTimelineTimeDomain(
        [timelinePoint(1, 100_000), timelinePoint(2, 200_000)],
        Number.POSITIVE_INFINITY,
      ),
    ).toEqual([100_000, 200_000]);
  });

  it("throws the exact error when point-derived expansion cannot ascend", () => {
    expectExactRangeError(
      () =>
        buildTimelineTimeDomain(
          [timelinePoint(1, Number.MAX_VALUE)],
          0,
        ),
      "timeline time domain exceeds finite numeric bounds",
    );
  });
});

describe("timeline domain composition and purity", () => {
  it("returns finite ascending readonly-compatible tuples", () => {
    const priceDomain: TimelineNumericDomain = buildTimelinePriceDomain([
      timelinePoint(10, 100_000),
    ]);
    const timeDomain: TimelineNumericDomain = buildTimelineTimeDomain(
      [timelinePoint(10, 100_000)],
      0,
    );

    expectFiniteAscending(priceDomain);
    expectFiniteAscending(timeDomain);
  });

  it("does not mutate the input array or point objects", () => {
    const first = Object.freeze(timelinePoint(-10, 300_000));
    const second = Object.freeze(timelinePoint(20, 100_000));
    const points = Object.freeze([first, second]);
    const before = JSON.stringify(points);

    buildTimelineDomains(points, 500_000);

    expect(JSON.stringify(points)).toBe(before);
    expect(points[0]).toBe(first);
    expect(points[1]).toBe(second);
  });

  it("returns equal values for equal inputs and anchors", () => {
    const firstInput = [timelinePoint(-10, 300_000), timelinePoint(20, 100_000)];
    const secondInput = firstInput.map((point) => ({ ...point }));

    expect(buildTimelineDomains(firstInput, 500_000)).toEqual(
      buildTimelineDomains(secondInput, 500_000),
    );
  });

  it("delegates combined results to the individual helpers exactly", () => {
    const points = [timelinePoint(-10, 300_000), timelinePoint(20, 100_000)];
    const anchor = 500_000;

    expect(buildTimelineDomains(points, anchor)).toEqual({
      price: buildTimelinePriceDomain(points),
      time: buildTimelineTimeDomain(points, anchor),
    });
  });

  it("allows type-only pure-model dependencies and rejects runtime ownership", () => {
    const imports = staticImportSpecifiers(source);
    const runtimeImports = runtimeImportSpecifiers(source);

    expect(imports).toEqual(["./timelineNormalization"]);
    expect(runtimeImports).toEqual([]);
    expect(source).not.toMatch(/^\s*<\/?[A-Za-z][^>]*>/m);
    expect(source).not.toMatch(
      /(?:window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|Date\.now\s*\(|new\s+Date\s*\(\s*\)|setTimeout|setInterval|Math\.random|process\.env)/,
    );
  });
});
