import {
  availabilityMessage,
  formatOptionalAge,
  formatOptionalCompact,
  formatTickerPercent,
  formatTickerPrice,
  statusLabel,
} from "./marketHealthPresentation";
import { TimelineChartRenderer } from "./TimelineChartRenderer";
import { buildTimelineDomains } from "./timelineDomains";
import { normalizeTimelinePoints } from "./timelineNormalization";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
  MarketTimelinePoint,
} from "./types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { StatusBadge } from "@/shared/components/StatusBadge";
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
                    <TimelineChartRenderer
                      points={normalizedTimelinePoints}
                      anomalies={timelineAnomalies}
                      visibleAnomalies={visibleTimelineAnomalies}
                      domains={timelineDomains}
                    />
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
