import { describe, expect, it } from "vitest";

import {
  buildAreaPath,
  buildLinePath,
  buildTicks,
  PLOT_BOTTOM,
  PLOT_LEFT,
  PLOT_RIGHT,
  PLOT_TOP,
  projectPrice,
  projectTime,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "./timelineChartGeometry";
import type { NormalizedTimelinePoint } from "./timelineNormalization";

const domains = {
  time: [0, 100] as const,
  price: [10, 20] as const,
};

function point(timestampMs: number, price: number): NormalizedTimelinePoint {
  return {
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    price,
    priceLabel: String(price),
    spreadPct: null,
    tradesPerMinute: null,
    lastEventAgeMs: null,
  };
}

describe("timeline chart geometry", () => {
  it("projects both domain boundaries to the stable plot bounds", () => {
    expect(projectTime(0, domains.time)).toBe(PLOT_LEFT);
    expect(projectTime(100, domains.time)).toBe(
      VIEWBOX_WIDTH - PLOT_RIGHT,
    );
    expect(projectPrice(20, domains.price)).toBe(PLOT_TOP);
    expect(projectPrice(10, domains.price)).toBe(
      VIEWBOX_HEIGHT - PLOT_BOTTOM,
    );
  });

  it("builds stable, evenly spaced ticks including both endpoints", () => {
    expect(buildTicks(domains.time, 5)).toEqual([0, 25, 50, 75, 100]);
    expect(buildTicks(domains.price, 3)).toEqual([10, 15, 20]);
  });

  it("builds ordered line and closed fill paths", () => {
    const points = [point(0, 10), point(50, 15), point(100, 20)];

    expect(buildLinePath(points, domains)).toBe(
      "M 58 282 L 522 143 L 986 4",
    );
    expect(buildAreaPath(points, domains)).toBe(
      "M 58 282 L 522 143 L 986 4 L 986 282 L 58 282 Z",
    );
  });

  it("returns empty paths for empty geometry", () => {
    expect(buildLinePath([], domains)).toBe("");
    expect(buildAreaPath([], domains)).toBe("");
  });

  it("does not mutate points or domains", () => {
    const points = Object.freeze([
      Object.freeze(point(0, 10)),
      Object.freeze(point(100, 20)),
    ]);
    const frozenDomains = Object.freeze({
      time: Object.freeze([0, 100] as const),
      price: Object.freeze([10, 20] as const),
    });
    const before = JSON.stringify({ points, frozenDomains });

    buildLinePath(points, frozenDomains);
    buildAreaPath(points, frozenDomains);
    buildTicks(frozenDomains.time, 5);

    expect(JSON.stringify({ points, frozenDomains })).toBe(before);
  });
});
