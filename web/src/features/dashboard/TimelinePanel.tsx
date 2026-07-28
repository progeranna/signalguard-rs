import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildTimelineDomains } from "./timelineDomains";
import {
  normalizeTimelinePoints,
  type NormalizedTimelinePoint,
} from "./timelineNormalization";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
  MarketTimelinePoint,
} from "./types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatAgeMs, formatCompactNumber } from "@/shared/lib/format";
import { toStatusTone } from "@/shared/lib/status";

export type TimelinePanelProps = Readonly<{
  selectedMarket: DashboardSymbolSummary | null;
  timelinePoints: readonly MarketTimelinePoint[];
  timelineAnomalies: readonly DashboardAnomaly[];
  isSummaryLoading: boolean;
  isTimelineLoading: boolean;
  timelineErrorMessage: string | null;
  onRetryTimeline: () => void;
  emptyAnchorMs: number;
}>;

export function TimelinePanel({
  selectedMarket,
  timelinePoints,
  timelineAnomalies,
  isSummaryLoading,
  isTimelineLoading,
  timelineErrorMessage,
  onRetryTimeline,
  emptyAnchorMs,
}: TimelinePanelProps) {
  if (isSummaryLoading) {
    return (
      <section>
        <LoadingSkeleton className="h-40" />
      </section>
    );
  }

  const observed = selectedMarket?.availability === "observed";
  const normalizedTimelinePoints = observed
    ? [...normalizeTimelinePoints(timelinePoints)]
    : [];
  const timelineDomains = observed
    ? buildTimelineDomains(normalizedTimelinePoints, emptyAnchorMs)
    : null;
  const visibleTimelineAnomalies =
    observed && timelineDomains !== null
      ? buildVisibleTimelineAnomalies(timelineAnomalies, timelineDomains.time)
      : [];
  const timelineSeverity = observed
    ? highestAnomalySeverity(timelineAnomalies)
    : null;
  const statusText = selectedMarket
    ? marketStatusLabel(selectedMarket)
    : "No data yet";
  const statusTone = toStatusTone(selectedMarket?.health?.status, "neutral");

  return (
    <section>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2.5 sm:px-4">
          {selectedMarket ? (
            <>
              <div className="mb-2">
                <div className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold text-white">
                  <span>{selectedMarket.symbol}</span>
                  <span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                    {selectedMarket.source === "live" ? "Live" : "Demo"}
                  </span>
                  {timelineSeverity ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${anomalyMarkerBadgeClass(
                        timelineSeverity,
                      )}`}
                    >
                      {statusLabel(timelineSeverity)} anomaly
                    </span>
                  ) : null}
                </div>
              </div>
              {!observed ? (
                <EmptyBlock
                  message={availabilityMessage(selectedMarket.availability)}
                />
              ) : timelineErrorMessage !== null ? (
                <ErrorPanel
                  title="Market timeline unavailable"
                  message={timelineErrorMessage}
                  onRetry={onRetryTimeline}
                />
              ) : isTimelineLoading ? (
                <LoadingSkeleton className="h-[320px]" />
              ) : normalizedTimelinePoints.length === 0 ? (
                <div className="border-y border-white/10 px-2 py-10 text-sm leading-6 text-slate-400">
                  Waiting for market data
                </div>
              ) : timelineDomains !== null ? (
                <div className="flex min-h-[285px] rounded-xl bg-slate-950/35">
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={normalizedTimelinePoints}
                        margin={{ top: 4, right: 14, bottom: 2, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="marketTimelineFill"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#7EE45B"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="100%"
                              stopColor="#7EE45B"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="rgba(100,116,139,0.18)"
                          strokeDasharray="3 8"
                          vertical={false}
                        />
                        <XAxis
                          axisLine={false}
                          dataKey="timestampMs"
                          domain={timelineDomains.time}
                          height={34}
                          label={{
                            value: "Time",
                            position: "insideBottom",
                            offset: -2,
                            fill: "#64748b",
                            fontSize: 11,
                          }}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          tickFormatter={formatTimelineTick}
                          tickLine={false}
                          tickMargin={2}
                          type="number"
                        />
                        <YAxis
                          axisLine={false}
                          domain={timelineDomains.price}
                          label={{
                            value: "Price",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#64748b",
                            fontSize: 11,
                          }}
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          tickFormatter={formatTimelinePriceTick}
                          tickLine={false}
                          type="number"
                          width={58}
                        />
                        <Tooltip
                          content={
                            <TimelineTooltip anomalies={timelineAnomalies} />
                          }
                        />
                        {visibleTimelineAnomalies.map((anomaly) => (
                          <ReferenceLine
                            key={anomaly.id}
                            stroke={anomalySeverityColor(anomaly.severity)}
                            strokeDasharray="3 4"
                            strokeOpacity={0.55}
                            x={anomaly.timestampMs}
                          />
                        ))}
                        <Area
                          dataKey="price"
                          fill="url(#marketTimelineFill)"
                          isAnimationActive={false}
                          stroke="#7EE45B"
                          strokeWidth={2.4}
                          type="monotone"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyBlock message="Waiting for market data" />
          )}
        </div>

        <aside className="flex h-full min-h-[285px] flex-col rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3">
          <div className="border-b border-white/10 pb-1.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm font-bold text-white">
                {selectedMarket?.symbol ?? "Unknown market"}
              </p>
              <StatusBadge status={statusTone} text={statusText} />
            </div>
          </div>
          {observed ? (
            <div className="mt-3 flex flex-1 flex-col justify-evenly gap-2">
              <SignalSnapshotMetric
                label="Price"
                value={formatTickerPrice(
                  selectedMarket?.state?.last_trade_price,
                )}
              />
              <SignalSnapshotMetric
                label="Spread"
                value={formatTickerPercent(selectedMarket?.state?.spread_pct)}
              />
              <SignalSnapshotMetric
                label="Trades/min"
                value={formatOptionalCompact(
                  selectedMarket?.state?.trades_per_minute,
                )}
              />
              <SignalSnapshotMetric
                label="Freshness"
                value={formatOptionalAge(
                  selectedMarket?.state?.last_event_age_ms,
                )}
              />
            </div>
          ) : (
            <EmptyBlock
              message={
                selectedMarket
                  ? availabilityMessage(selectedMarket.availability)
                  : "No current market state available for this market."
              }
            />
          )}
        </aside>
      </div>
    </section>
  );

}

function TimelineTooltip({
  active,
  anomalies,
  label,
  payload,
}: {
  active?: boolean;
  anomalies: readonly DashboardAnomaly[];
  label?: number;
  payload?: Array<{ payload: NormalizedTimelinePoint }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;

  if (!point) {
    return null;
  }

  const pointAnomalies = anomalies.filter((anomaly) => {
    const anomalyTime = Date.parse(anomaly.event_time || anomaly.created_at);

    return (
      Number.isFinite(anomalyTime) &&
      Math.abs(anomalyTime - point.timestampMs) <= 15_000
    );
  });

  return (
    <div
      style={{
        background: "#0E1822",
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: "10px",
        color: "#e2e8f0",
      }}
      className="min-w-[14rem] px-3 py-2.5 text-sm"
    >
      <p className="font-semibold text-white">
        {formatTimelineTooltipTimestamp(
          typeof label === "number"
            ? new Date(label).toISOString()
            : point.timestamp,
        )}
      </p>
      <div className="mt-2 space-y-1 text-slate-300">
        <p>Price: {point.priceLabel}</p>
        {point.spreadPct !== null ? (
          <p>Spread: {formatTickerPercent(point.spreadPct)}</p>
        ) : null}
        {point.tradesPerMinute !== null ? (
          <p>Trades/min: {formatOptionalCompact(point.tradesPerMinute)}</p>
        ) : null}
        {point.lastEventAgeMs !== null ? (
          <p>Freshness: {formatOptionalAge(point.lastEventAgeMs)}</p>
        ) : null}
        {pointAnomalies.length > 0 ? (
          <p>
            Anomalies:{" "}
            {pointAnomalies
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

function SignalSnapshotMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-slate-950/35 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function buildVisibleTimelineAnomalies(
  anomalies: readonly DashboardAnomaly[],
  timeDomain: readonly [number, number],
): Array<DashboardAnomaly & { timestampMs: number }> {
  return anomalies
    .map((anomaly) => {
      const timestampMs = Date.parse(anomaly.event_time || anomaly.created_at);

      if (!Number.isFinite(timestampMs)) {
        return null;
      }

      return {
        ...anomaly,
        timestampMs,
      };
    })
    .filter(
      (
        anomaly,
      ): anomaly is DashboardAnomaly & { timestampMs: number } =>
        anomaly !== null &&
        anomaly.timestampMs >= timeDomain[0] &&
        anomaly.timestampMs <= timeDomain[1],
    );
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

function highestAnomalySeverity(
  anomalies: readonly DashboardAnomaly[],
): DashboardAnomaly["severity"] | null {
  if (anomalies.some((anomaly) => anomaly.severity === "critical")) {
    return "critical";
  }

  if (anomalies.some((anomaly) => anomaly.severity === "warning")) {
    return "warning";
  }

  if (anomalies.some((anomaly) => anomaly.severity === "info")) {
    return "info";
  }

  return null;
}

function anomalyMarkerBadgeClass(
  severity: DashboardAnomaly["severity"],
): string {
  switch (severity) {
    case "critical":
      return "border-rose-400/35 bg-rose-400/10 text-rose-200";
    case "warning":
      return "border-amber-400/35 bg-amber-400/10 text-amber-200";
    case "info":
      return "border-sky-400/35 bg-sky-400/10 text-sky-200";
    default:
      return "border-slate-500/40 bg-slate-700/30 text-slate-300";
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

function formatOptionalAge(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return formatAgeMs(value);
}

function formatOptionalCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return formatCompactNumber(value);
}

function formatTickerPrice(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value;
}

function formatTickerPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function statusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function marketStatusLabel(symbol: DashboardSymbolSummary): string {
  switch (symbol.availability) {
    case "configured":
      return "Configured";
    case "awaiting":
      return "Awaiting data";
    case "unavailable":
      return "Unavailable";
    case "observed":
      return statusLabel(symbol.health?.status);
  }
}

function availabilityMessage(
  availability: DashboardSymbolSummary["availability"],
): string {
  switch (availability) {
    case "configured":
      return "Configured for Live; Live ingestion is not active.";
    case "awaiting":
      return "Awaiting first Live market data.";
    case "unavailable":
      return "Live market data is unavailable.";
    case "observed":
      return "No current market state available for this market.";
  }
}
