import type { MarketTimelinePoint } from "./types";

export type NormalizedTimelinePoint = Readonly<{
  timestamp: string;
  timestampMs: number;
  price: number;
  priceLabel: string;
  spreadPct: number | null;
  tradesPerMinute: number | null;
  lastEventAgeMs: number | null;
}>;

export function normalizeTimelinePoint(
  point: MarketTimelinePoint,
): NormalizedTimelinePoint | null {
  const timestampMs = Date.parse(point.timestamp);

  if (!Number.isFinite(timestampMs) || point.price.trim().length === 0) {
    return null;
  }

  const price = Number(point.price);

  if (!Number.isFinite(price)) {
    return null;
  }

  return {
    timestamp: point.timestamp,
    timestampMs,
    price,
    priceLabel: point.price,
    spreadPct: normalizeFinite(point.spread_pct),
    tradesPerMinute: normalizeFiniteNonNegative(point.trades_per_minute),
    lastEventAgeMs: normalizeFiniteNonNegative(point.last_event_age_ms),
  };
}

export function normalizeTimelinePoints(
  points: readonly MarketTimelinePoint[],
): readonly NormalizedTimelinePoint[] {
  const normalizedPoints: NormalizedTimelinePoint[] = [];

  for (const point of points) {
    const normalizedPoint = normalizeTimelinePoint(point);

    if (normalizedPoint !== null) {
      normalizedPoints.push(normalizedPoint);
    }
  }

  return normalizedPoints;
}

function normalizeFinite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function normalizeFiniteNonNegative(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}
