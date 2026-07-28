import type { NormalizedTimelinePoint } from "./timelineNormalization";

export type TimelineNumericDomain = readonly [number, number];

export type TimelineDomains = Readonly<{
  price: TimelineNumericDomain;
  time: TimelineNumericDomain;
}>;

const TIME_EXPANSION_MS = 60_000;
const PRICE_DOMAIN_RANGE_ERROR =
  "timeline price domain exceeds finite numeric bounds";
const EMPTY_TIME_DOMAIN_RANGE_ERROR =
  "timeline empty time-domain anchor must produce finite bounds";
const TIME_DOMAIN_RANGE_ERROR =
  "timeline time domain exceeds finite numeric bounds";

/** Builds a finite, strictly ascending price domain from normalized points. */
export function buildTimelinePriceDomain(
  points: readonly NormalizedTimelinePoint[],
): TimelineNumericDomain {
  const firstPoint = points[0];

  if (firstPoint === undefined) {
    return [0, 1];
  }

  let low = firstPoint.price;
  let high = firstPoint.price;

  for (let index = 1; index < points.length; index += 1) {
    const price = points[index].price;
    low = Math.min(low, price);
    high = Math.max(high, price);
  }

  const range = Math.max(high - low, 0.0001);
  const magnitude = Math.max(Math.abs(low), Math.abs(high));
  const padding = Math.max(range * 0.08, magnitude * 0.002, 0.01);

  return requireFiniteAscendingDomain(
    [low - padding, high + padding],
    PRICE_DOMAIN_RANGE_ERROR,
  );
}

/** Builds a finite, strictly ascending time domain using an explicit empty anchor. */
export function buildTimelineTimeDomain(
  points: readonly NormalizedTimelinePoint[],
  emptyAnchorMs: number,
): TimelineNumericDomain {
  const firstPoint = points[0];

  if (firstPoint === undefined) {
    return requireFiniteAscendingDomain(
      [emptyAnchorMs - TIME_EXPANSION_MS, emptyAnchorMs],
      EMPTY_TIME_DOMAIN_RANGE_ERROR,
    );
  }

  let minimumTimestampMs = firstPoint.timestampMs;
  let maximumTimestampMs = firstPoint.timestampMs;

  for (let index = 1; index < points.length; index += 1) {
    const timestampMs = points[index].timestampMs;
    minimumTimestampMs = Math.min(minimumTimestampMs, timestampMs);
    maximumTimestampMs = Math.max(maximumTimestampMs, timestampMs);
  }

  const domain: TimelineNumericDomain =
    minimumTimestampMs === maximumTimestampMs
      ? [
          minimumTimestampMs - TIME_EXPANSION_MS,
          maximumTimestampMs + TIME_EXPANSION_MS,
        ]
      : [minimumTimestampMs, maximumTimestampMs];

  return requireFiniteAscendingDomain(domain, TIME_DOMAIN_RANGE_ERROR);
}

/** Delegates to the individual price and time domain policies. */
export function buildTimelineDomains(
  points: readonly NormalizedTimelinePoint[],
  emptyAnchorMs: number,
): TimelineDomains {
  return {
    price: buildTimelinePriceDomain(points),
    time: buildTimelineTimeDomain(points, emptyAnchorMs),
  };
}

function requireFiniteAscendingDomain(
  domain: TimelineNumericDomain,
  errorMessage: string,
): TimelineNumericDomain {
  const [lower, upper] = domain;

  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) {
    throw new RangeError(errorMessage);
  }

  return domain;
}
