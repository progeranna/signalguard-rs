import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
} from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import {
  formatAgeMs,
  formatCompactNumber,
  formatDecimalString,
  formatPercent,
  formatTimestamp,
} from "@/shared/lib/format";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

export function SymbolDetailPage() {
  const navigate = useNavigate();
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = summary?.symbols ?? [];
  const recentAnomalies = summary?.recent_anomalies ?? [];
  const routeSymbol = useParams().symbol ?? "";
  const selectedSymbol = normalizeSymbol(routeSymbol);
  const selectedSummary =
    availableSymbols.find((entry) => normalizeSymbol(entry.symbol) === selectedSymbol) ?? null;
  const selectedAnomalies = recentAnomalies.filter(
    (anomaly) => normalizeSymbol(anomaly.symbol) === selectedSymbol,
  );
  const isKnownSymbol = selectedSummary !== null;
  const statusTone = toStatusTone(selectedSummary?.health?.status, "neutral");
  const symbolStatusText = formatStatusLabel(selectedSummary?.health?.status);
  const [isSymbolMenuOpen, setIsSymbolMenuOpen] = useState(false);

  function handleSymbolChange(nextSymbol: string) {
    setIsSymbolMenuOpen(false);
    navigate(`/symbols/${nextSymbol}`);
  }

  useEffect(() => {
    setIsSymbolMenuOpen(false);
  }, [selectedSymbol]);

  useEffect(() => {
    if (!isSymbolMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setIsSymbolMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSymbolMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSymbolMenuOpen]);

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Dashboard / Symbol"
        title={selectedSymbol}
        description="Symbol-level market-data quality, freshness, and anomaly context."
        actions={
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <StatusBadge status={statusTone} text={symbolStatusText} />
            {availableSymbols.length > 0 ? (
              <div
                ref={selectorRef}
                className="relative flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"
              >
                <span>Monitored symbol</span>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isSymbolMenuOpen}
                  onClick={() => setIsSymbolMenuOpen((open) => !open)}
                  className="flex min-w-[12rem] items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08131d] px-3 py-2 text-sm font-semibold tracking-normal text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                >
                  <span>{isKnownSymbol ? selectedSymbol : "Choose a symbol"}</span>
                  <span
                    aria-hidden="true"
                    className={`text-slate-500 transition ${isSymbolMenuOpen ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </button>
                {isSymbolMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-[var(--sg-panel-strong)] shadow-[0_18px_40px_rgba(2,6,23,0.44)]"
                  >
                    <div className="max-h-72 overflow-y-auto py-1">
                      {availableSymbols.map((entry) => {
                        const isSelected = normalizeSymbol(entry.symbol) === selectedSymbol;

                        return (
                          <button
                            key={entry.symbol}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            onClick={() => handleSymbolChange(entry.symbol)}
                            className={[
                              "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm font-semibold tracking-normal transition",
                              isSelected
                                ? "bg-cyan-400/10 text-cyan-100"
                                : "text-slate-200 hover:bg-white/[0.04] hover:text-white",
                            ].join(" ")}
                          >
                            <span>{entry.symbol}</span>
                            {isSelected ? (
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
                                Current
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      />

      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message="Symbol detail is using the existing dashboard summary in this phase. Retry once the summary endpoint is available."
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      {!dashboardSummaryQuery.isLoading && !isKnownSymbol ? (
        <SymbolNotFoundState selectedSymbol={selectedSymbol} availableSymbols={availableSymbols} />
      ) : null}

      {dashboardSummaryQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} className="h-36" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Health"
            value={selectedSummary?.health ? `${selectedSummary.health.score}` : "—"}
            description={
              selectedSummary?.health
                ? `${symbolStatusText} market-data quality score.`
                : "No symbol health summary available for this symbol."
            }
            tone={statusTone}
          />
          <MetricCard
            label="Last Price"
            value={formatDisplayValue(selectedSummary?.state?.last_trade_price)}
            description="Latest trade price from the existing dashboard summary."
            tone="neutral"
          />
          <MetricCard
            label="Spread"
            value={formatDisplayPercent(selectedSummary?.state?.spread_pct)}
            description="Current spread signal from the summary-backed state view."
            tone="neutral"
          />
          <MetricCard
            label="Trades/min"
            value={formatDisplayCompact(selectedSummary?.state?.trades_per_minute)}
            description="Recent trade activity reported in the summary response."
            tone="info"
          />
          <MetricCard
            label="Freshness"
            value={formatDisplayAge(selectedSummary?.state?.last_event_age_ms)}
            description="Age of the latest observed event for this symbol."
            tone="warning"
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="sg-panel px-5 py-5">
          <PanelHeader
            eyebrow="Signal Preview"
            title={`${selectedSymbol} signal snapshot`}
            description="Summary-backed preview only."
          />
          {dashboardSummaryQuery.isLoading ? (
            <LoadingSkeleton className="mt-4 h-44" />
          ) : selectedSummary ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DetailMetric
                label="Summary status"
                value={symbolStatusText}
                emphasis={statusTone}
              />
              <DetailMetric
                label="Recent anomalies"
                value={formatCount(selectedAnomalies.length)}
              />
              <DetailMetric
                label="Price move (1m)"
                value={formatDisplayPercent(selectedSummary.state?.price_change_1m_pct)}
              />
              <DetailMetric
                label="Depth sequence gaps"
                value={formatCount(selectedSummary.state?.depth_sequence_gap_count ?? 0)}
              />
            </div>
          ) : (
            <EmptyPanel message="Summary-backed preview is unavailable for this symbol." />
          )}
        </section>

        <section className="sg-panel px-5 py-5">
          <PanelHeader
            eyebrow="Current Market State"
            title="Latest normalized state"
            description="Read-only fields derived from the existing summary response."
          />
          {dashboardSummaryQuery.isLoading ? (
            <LoadingSkeleton className="mt-4 h-44" />
          ) : selectedSummary?.state ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <StateRow label="Last trade price" value={formatDisplayValue(selectedSummary.state.last_trade_price)} />
              <StateRow label="Best bid" value={formatDisplayValue(selectedSummary.state.best_bid_price)} />
              <StateRow label="Best ask" value={formatDisplayValue(selectedSummary.state.best_ask_price)} />
              <StateRow label="Spread" value={formatDisplayPercent(selectedSummary.state.spread_pct)} />
              <StateRow label="Trades/min" value={formatDisplayCompact(selectedSummary.state.trades_per_minute)} />
              <StateRow label="Last event" value={formatDisplayTimestamp(selectedSummary.state.last_event_time)} />
              <StateRow label="Freshness" value={formatDisplayAge(selectedSummary.state.last_event_age_ms)} />
              <StateRow label="Depth gap count" value={formatCount(selectedSummary.state.depth_sequence_gap_count)} />
            </dl>
          ) : (
            <EmptyPanel message="No current market state available for this symbol." />
          )}
        </section>
      </div>

      <section className="sg-panel px-5 py-5">
        <PanelHeader
          eyebrow="Recent Anomalies"
          title={`Recent anomalies for ${selectedSymbol}`}
          description="Detector output filtered from the dashboard summary response."
        />
        {dashboardSummaryQuery.isLoading ? (
          <LoadingSkeleton className="mt-4 h-52" />
        ) : selectedAnomalies.length > 0 ? (
          <>
            <div className="mt-4 hidden overflow-hidden lg:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Severity</th>
                    <th className="pb-3 pr-4">Observed</th>
                    <th className="pb-3 pr-4">Threshold</th>
                    <th className="pb-3">Detected at</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAnomalies.map((anomaly) => (
                    <AnomalyTableRow key={anomaly.id} anomaly={anomaly} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-3 lg:hidden">
              {selectedAnomalies.map((anomaly) => (
                <AnomalyCard key={anomaly.id} anomaly={anomaly} />
              ))}
            </div>
          </>
        ) : (
          <EmptyPanel message="No recent anomalies for this symbol." />
        )}
      </section>
    </section>
  );
}

function SymbolNotFoundState({
  selectedSymbol,
  availableSymbols,
}: {
  selectedSymbol: string;
  availableSymbols: DashboardSymbolSummary[];
}) {
  return (
    <section className="sg-panel border-amber-400/20 bg-amber-950/10 px-5 py-5">
      <PanelHeader
        eyebrow="Symbol Status"
        title={`${selectedSymbol} is not in the current summary`}
        description="Symbol not found in current dashboard summary. Choose one of the currently monitored symbols."
      />
      {availableSymbols.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {availableSymbols.map((entry) => (
            <Link
              key={entry.symbol}
              to={`/symbols/${entry.symbol}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/25 hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              {entry.symbol}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyPanel message="No monitored symbols are available from the current dashboard summary." />
      )}
    </section>
  );
}

function PanelHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
        {eyebrow}
      </p>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  emphasis = "neutral",
}: {
  label: string;
  value: string;
  emphasis?: StatusTone;
}) {
  const textClass =
    emphasis === "healthy"
      ? "text-emerald-200"
      : emphasis === "degraded" || emphasis === "warning"
        ? "text-amber-200"
        : emphasis === "unhealthy" || emphasis === "critical"
          ? "text-orange-200"
          : emphasis === "info"
            ? "text-cyan-100"
            : "text-white";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${textClass}`}>{value}</p>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function AnomalyTableRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-3 pr-4 text-sm font-semibold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="py-3 pr-4">
        <StatusBadge
          status={toStatusTone(anomaly.severity, "neutral")}
          text={formatStatusLabel(anomaly.severity)}
        />
      </td>
      <td className="py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatObservation(anomaly.observed_value)}
      </td>
      <td className="py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatObservation(anomaly.threshold_value)}
      </td>
      <td className="py-3 text-sm font-semibold text-slate-300">
        {formatDisplayTimestamp(anomaly.event_time)}
      </td>
    </tr>
  );
}

function AnomalyCard({ anomaly }: { anomaly: DashboardAnomaly }) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {formatAnomalyType(anomaly.anomaly_type)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
            {formatDisplayTimestamp(anomaly.event_time)}
          </p>
        </div>
        <StatusBadge
          status={toStatusTone(anomaly.severity, "neutral")}
          text={formatStatusLabel(anomaly.severity)}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StateRow label="Observed" value={formatObservation(anomaly.observed_value)} />
        <StateRow label="Threshold" value={formatObservation(anomaly.threshold_value)} />
      </div>
    </article>
  );
}

function normalizeSymbol(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase();

  return normalized ? normalized : "UNKNOWN";
}

function formatStatusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDisplayValue(value: string | null | undefined): string {
  const formatted = formatDecimalString(value);
  return formatted === "n/a" ? "—" : formatted;
}

function formatDisplayPercent(value: number | null | undefined): string {
  const formatted = formatPercent(value);
  return formatted === "n/a" ? "—" : formatted;
}

function formatDisplayCompact(value: number | null | undefined): string {
  const formatted = formatCompactNumber(value);
  return formatted === "n/a" ? "—" : formatted;
}

function formatDisplayAge(value: number | null | undefined): string {
  const formatted = formatAgeMs(value);
  return formatted === "n/a" ? "—" : formatted;
}

function formatDisplayTimestamp(value: string | null | undefined): string {
  const formatted = formatTimestamp(value);
  return formatted === "n/a" ? "—" : formatted;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatObservation(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatAnomalyType(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
