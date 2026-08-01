import type { TimelineDomains } from "./timelineDomains";
import type { NormalizedTimelinePoint } from "./timelineNormalization";

export const VIEWBOX_WIDTH = 1_000;
export const VIEWBOX_HEIGHT = 320;
export const PLOT_LEFT = 58;
export const PLOT_RIGHT = 14;
export const PLOT_TOP = 4;
export const PLOT_BOTTOM = 38;
export const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
export const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

export function buildLinePath(
  points: readonly NormalizedTimelinePoint[],
  domains: TimelineDomains,
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${projectTime(point.timestampMs, domains.time)} ${projectPrice(point.price, domains.price)}`;
    })
    .join(" ");
}

export function buildAreaPath(
  points: readonly NormalizedTimelinePoint[],
  domains: TimelineDomains,
): string {
  if (points.length === 0) {
    return "";
  }

  const baseline = PLOT_TOP + PLOT_HEIGHT;
  const firstX = projectTime(points[0].timestampMs, domains.time);
  const lastX = projectTime(points[points.length - 1].timestampMs, domains.time);

  return `${buildLinePath(points, domains)} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
}

export function buildTicks(
  domain: readonly [number, number],
  count: number,
): number[] {
  const [lower, upper] = domain;

  return Array.from(
    { length: count },
    (_, index) => lower + ((upper - lower) * index) / (count - 1),
  );
}

export function projectTime(
  value: number,
  domain: readonly [number, number],
): number {
  return PLOT_LEFT + normalize(value, domain) * PLOT_WIDTH;
}

export function projectPrice(
  value: number,
  domain: readonly [number, number],
): number {
  return PLOT_TOP + (1 - normalize(value, domain)) * PLOT_HEIGHT;
}

function normalize(value: number, domain: readonly [number, number]): number {
  return (value - domain[0]) / (domain[1] - domain[0]);
}
