import { useState } from "react";

import {
  formatOptionalAge,
  formatOptionalCompact,
  formatTickerPercent,
} from "./marketHealthPresentation";
import {
  buildAreaPath,
  buildLinePath,
  buildTicks,
  PLOT_HEIGHT,
  PLOT_LEFT,
  PLOT_RIGHT,
  PLOT_TOP,
  projectPrice,
  projectTime,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "./timelineChartGeometry";
import type { TimelineDomains } from "./timelineDomains";
import type { NormalizedTimelinePoint } from "./timelineNormalization";
import type { DashboardAnomaly } from "./types";

const TOOLTIP_MATCH_WINDOW_MS = 15_000;

type VisibleTimelineAnomaly = DashboardAnomaly & { timestampMs: number };

export type TimelineChartRendererProps = Readonly<{
  points: readonly NormalizedTimelinePoint[];
  anomalies: readonly DashboardAnomaly[];
  visibleAnomalies: readonly VisibleTimelineAnomaly[];
  domains: TimelineDomains;
}>;

export function TimelineChartRenderer({
  points,
  anomalies,
  visibleAnomalies,
  domains,
}: TimelineChartRendererProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePoint =
    activeIndex === null || points[activeIndex] === undefined
      ? null
      : points[activeIndex];
  const activeGeometry =
    activeIndex === null || activePoint === null
      ? null
      : {
          x: projectTime(activePoint.timestampMs, domains.time),
          y: projectPrice(activePoint.price, domains.price),
        };
  const xTicks = buildTicks(domains.time, 5);
  const yTicks = buildTicks(domains.price, 5);

  return (
    <div
      className="relative h-[285px] w-full"
      data-height="100%"
      data-testid="responsive-container"
      data-width="100%"
    >
      <svg
        aria-label="Market timeline chart"
        className="h-full w-full outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/70"
        data-data={JSON.stringify(points)}
        data-margin={JSON.stringify({ top: 4, right: 14, bottom: 2, left: 0 })}
        data-testid="chart"
        height="100%"
        preserveAspectRatio="none"
        role="img"
        tabIndex={0}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width="100%"
        onBlur={() => setActiveIndex(null)}
        onFocus={() => setActiveIndex((current) => current ?? 0)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setActiveIndex(null);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            setActiveIndex((current) => Math.max((current ?? 0) - 1, 0));
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            setActiveIndex((current) =>
              Math.min((current ?? 0) + 1, points.length - 1),
            );
          }
        }}
        onMouseLeave={() => setActiveIndex(null)}
        onMouseMove={(event) => {
          if (points.length === 0) {
            return;
          }

          const bounds = event.currentTarget.getBoundingClientRect();
          const width = bounds.width || VIEWBOX_WIDTH;
          const localX =
            ((event.clientX - bounds.left) / width) * VIEWBOX_WIDTH;
          const plotX = clamp(localX, PLOT_LEFT, VIEWBOX_WIDTH - PLOT_RIGHT);
          let nearestIndex = 0;
          let nearestDistance = Number.POSITIVE_INFINITY;

          points.forEach((point, index) => {
            const distance = Math.abs(
              projectTime(point.timestampMs, domains.time) - plotX,
            );
            if (distance < nearestDistance) {
              nearestIndex = index;
              nearestDistance = distance;
            }
          });

          setActiveIndex(nearestIndex);
        }}
      >
        <g
          aria-hidden="true"
          data-domain={JSON.stringify(domains.time)}
          data-testid="x-axis"
        />
        <g
          aria-hidden="true"
          data-domain={JSON.stringify(domains.price)}
          data-testid="y-axis"
        />
        <defs>
          <linearGradient
            id="marketTimelineFill"
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#7EE45B" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#7EE45B" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <g
          data-props={JSON.stringify({ vertical: false })}
          data-testid="grid"
        >
          {yTicks.map((tick) => (
            <line
              key={`grid-${tick}`}
              stroke="rgba(100,116,139,0.18)"
              strokeDasharray="3 8"
              x1={PLOT_LEFT}
              x2={VIEWBOX_WIDTH - PLOT_RIGHT}
              y1={projectPrice(tick, domains.price)}
              y2={projectPrice(tick, domains.price)}
            />
          ))}
        </g>

        <path
          aria-hidden="true"
          d={buildAreaPath(points, domains)}
          data-props={JSON.stringify({ isAnimationActive: false })}
          data-testid="area"
          fill="url(#marketTimelineFill)"
          stroke="none"
        />
        <path
          aria-hidden="true"
          d={buildLinePath(points, domains)}
          data-testid="price-line"
          fill="none"
          stroke="#7EE45B"
          strokeWidth="2.4"
        />

        {visibleAnomalies.map((anomaly) => (
          <line
            key={anomaly.id}
            data-stroke={anomalySeverityColor(anomaly.severity)}
            data-testid="reference-line"
            data-x={String(anomaly.timestampMs)}
            stroke={anomalySeverityColor(anomaly.severity)}
            strokeDasharray="3 4"
            strokeOpacity={0.55}
            x1={projectTime(anomaly.timestampMs, domains.time)}
            x2={projectTime(anomaly.timestampMs, domains.time)}
            y1={PLOT_TOP}
            y2={PLOT_TOP + PLOT_HEIGHT}
          />
        ))}

        <line
          stroke="rgba(148,163,184,0.24)"
          x1={PLOT_LEFT}
          x2={PLOT_LEFT}
          y1={PLOT_TOP}
          y2={PLOT_TOP + PLOT_HEIGHT}
        />
        <line
          stroke="rgba(148,163,184,0.24)"
          x1={PLOT_LEFT}
          x2={VIEWBOX_WIDTH - PLOT_RIGHT}
          y1={PLOT_TOP + PLOT_HEIGHT}
          y2={PLOT_TOP + PLOT_HEIGHT}
        />

        {activeGeometry ? (
          <circle
            aria-hidden="true"
            cx={activeGeometry.x}
            cy={activeGeometry.y}
            fill="#0E1822"
            r="4"
            stroke="#7EE45B"
            strokeWidth="2"
          />
        ) : null}
      </svg>

      <div className="pointer-events-none absolute inset-0 text-[11px] text-slate-500">
        {xTicks.map((tick, index) => (
          <span
            key={`x-tick-${tick}`}
            className={`absolute whitespace-nowrap ${
              index === 0
                ? ""
                : index === xTicks.length - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2"
            }`}
            style={{
              left: `${(projectTime(tick, domains.time) / VIEWBOX_WIDTH) * 100}%`,
              top: `${((PLOT_TOP + PLOT_HEIGHT + 16) / VIEWBOX_HEIGHT) * 100}%`,
            }}
          >
            {formatTimelineTick(tick)}
          </span>
        ))}
        {yTicks.map((tick) => (
          <span
            key={`y-tick-${tick}`}
            className="absolute -translate-x-full -translate-y-1/2 whitespace-nowrap pr-1"
            style={{
              left: "11%",
              top: `${(projectPrice(tick, domains.price) / VIEWBOX_HEIGHT) * 100}%`,
            }}
          >
            {formatTimelinePriceTick(tick)}
          </span>
        ))}
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: "52.2%", top: "98%" }}
        >
          Time
        </span>
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap"
          style={{ left: "1.2%", top: "44.7%" }}
        >
          Price
        </span>
      </div>

      {activePoint && activeGeometry ? (
        <TimelineTooltip
          activePoint={activePoint}
          anomalies={anomalies}
          left={`${(activeGeometry.x / VIEWBOX_WIDTH) * 100}%`}
        />
      ) : null}
    </div>
  );
}

function TimelineTooltip({
  activePoint,
  anomalies,
  left,
}: {
  activePoint: NormalizedTimelinePoint;
  anomalies: readonly DashboardAnomaly[];
  left: string;
}) {
  const pointAnomalies = anomalies.filter((anomaly) => {
    const anomalyTime = Date.parse(anomaly.event_time || anomaly.created_at);

    return (
      Number.isFinite(anomalyTime) &&
      Math.abs(anomalyTime - activePoint.timestampMs) <=
        TOOLTIP_MATCH_WINDOW_MS
    );
  });

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute top-2 z-10 min-w-[14rem] -translate-x-1/2 rounded-[10px] border border-slate-400/20 bg-[#0E1822] px-3 py-2.5 text-sm text-slate-200"
      data-testid="tooltip"
      style={{ left }}
    >
      <p className="font-semibold text-white">
        {formatTimelineTooltipTimestamp(activePoint.timestamp)}
      </p>
      <div className="mt-2 space-y-1 text-slate-300">
        <p>Price: {activePoint.priceLabel}</p>
        {activePoint.spreadPct !== null ? (
          <p>Spread: {formatTickerPercent(activePoint.spreadPct)}</p>
        ) : null}
        {activePoint.tradesPerMinute !== null ? (
          <p>
            Trades/min: {formatOptionalCompact(activePoint.tradesPerMinute)}
          </p>
        ) : null}
        {activePoint.lastEventAgeMs !== null ? (
          <p>Freshness: {formatOptionalAge(activePoint.lastEventAgeMs)}</p>
        ) : null}
        {pointAnomalies.length > 0 ? (
          <p>
            Anomalies: {pointAnomalies
              .map(
                (anomaly) =>
                  `${formatAnomalyType(anomaly.anomaly_type)} (${statusLabel(
                    anomaly.severity,
                  )})`,
              )
              .join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function formatTimelineTick(value: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatTimelinePriceTick(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatTimelineTooltipTimestamp(
  value: string | null | undefined,
): string {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function anomalySeverityColor(
  severity: DashboardAnomaly["severity"] | undefined,
): string {
  switch (severity) {
    case "critical":
      return "#FF6B5F";
    case "warning":
      return "#F5C542";
    case "info":
      return "#63A7FF";
    default:
      return "#94A3B8";
  }
}

function formatAnomalyType(type: string | null | undefined): string {
  if (!type) {
    return "Unknown";
  }

  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(severity: DashboardAnomaly["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
