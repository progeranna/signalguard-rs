import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useCatalogDashboardSummaryQuery } from "@/features/dashboard/api";
import { isDashboardSymbolPlaceholder } from "@/features/dashboard/marketOrder";
import { storeSelectedSymbol } from "@/features/dashboard/selectedSymbol";
import { useResolvedUiMode } from "@/features/dashboard/uiMode";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
} from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
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
  const selectedUiMode = useResolvedUiMode();
  const dashboardSummaryQuery = useCatalogDashboardSummaryQuery(selectedUiMode);
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
  const symbolStatusText = formatMarketStatusLabel(selectedSummary);

  useEffect(() => {
    if (isKnownSymbol && selectedSummary) {
      storeSelectedSymbol(selectedSummary.symbol);
    }
  }, [isKnownSymbol, selectedSummary]);

  return (
    <section className="space-y-4">
      <section className="sg-panel overflow-visible px-5 py-5 sm:px-6">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/80">
            Dashboard / Market
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {selectedSymbol}
            </h1>
            <StatusBadge status={statusTone} text={symbolStatusText} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Market-level market-data quality, freshness, and anomaly context.
          </p>
        </div>

        {dashboardSummaryQuery.isLoading || isKnownSymbol ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            {dashboardSummaryQuery.isLoading ? (
              <LoadingSkeleton className="h-20" />
            ) : (
              <MetricStrip
                healthScore={selectedSummary?.health?.score ?? null}
                freshness={selectedSummary?.state?.last_event_age_ms ?? null}
                lastPrice={selectedSummary?.state?.last_trade_price ?? null}
                spread={selectedSummary?.state?.spread_pct ?? null}
                statusTone={statusTone}
                tradesPerMinute={selectedSummary?.state?.trades_per_minute ?? null}
              />
            )}
          </div>
        ) : null}
      </section>

      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message="Market detail is using the existing dashboard summary in this phase. Retry once the summary endpoint is available."
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      {!dashboardSummaryQuery.isLoading && !isKnownSymbol ? (
        <SymbolNotFoundState selectedSymbol={selectedSymbol} availableSymbols={availableSymbols} />
      ) : null}

      {dashboardSummaryQuery.isLoading || isKnownSymbol ? (
        <>
          <section className="sg-panel px-5 py-5">
            {dashboardSummaryQuery.isLoading ? (
              <LoadingSkeleton className="h-64" />
            ) : (
              <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
                <div>
                  <PanelHeader
                    eyebrow="Signal Preview"
                    title={`${selectedSymbol} signal snapshot`}
                    description="Summary-backed preview only."
                  />
                  {selectedSummary ? (
                    <dl className="mt-5 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                      <InlineDataRow
                        label="Summary status"
                        value={symbolStatusText}
                        valueClassName={toneTextClass(statusTone)}
                      />
                      <InlineDataRow
                        label="Recent anomalies"
                        value={formatCount(selectedAnomalies.length)}
                      />
                      <InlineDataRow
                        label="Price move (1m)"
                        value={formatDisplayPercent(selectedSummary.state?.price_change_1m_pct)}
                      />
                      <InlineDataRow
                        label="Depth sequence gaps"
                        value={formatCount(selectedSummary.state?.depth_sequence_gap_count ?? 0)}
                      />
                    </dl>
                  ) : (
                    <FlatEmptyState message="Summary-backed preview is unavailable for this market." />
                  )}
                </div>

                <div>
                  <PanelHeader
                    eyebrow="Current Market State"
                    title="Latest normalized state"
                    description="Read-only fields derived from the existing summary response."
                  />
                  {selectedSummary?.state ? (
                    <dl className="mt-5 grid gap-x-8 border-y border-white/[0.08] md:grid-cols-2">
                      <InlineDataRow
                        label="Last trade price"
                        value={formatDisplayValue(selectedSummary.state.last_trade_price)}
                      />
                      <InlineDataRow
                        label="Best bid"
                        value={formatDisplayValue(selectedSummary.state.best_bid_price)}
                      />
                      <InlineDataRow
                        label="Best ask"
                        value={formatDisplayValue(selectedSummary.state.best_ask_price)}
                      />
                      <InlineDataRow
                        label="Spread"
                        value={formatDisplayPercent(selectedSummary.state.spread_pct)}
                      />
                      <InlineDataRow
                        label="Trades/min"
                        value={formatDisplayCompact(selectedSummary.state.trades_per_minute)}
                      />
                      <InlineDataRow
                        label="Last event"
                        value={formatDisplayTimestamp(selectedSummary.state.last_event_time)}
                      />
                      <InlineDataRow
                        label="Freshness"
                        value={formatDisplayAge(selectedSummary.state.last_event_age_ms)}
                      />
                      <InlineDataRow
                        label="Depth gap count"
                        value={formatCount(selectedSummary.state.depth_sequence_gap_count)}
                      />
                    </dl>
                  ) : (
                    <FlatEmptyState message="No current market state available for this market." />
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">
                Recent anomalies for {selectedSymbol}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Latest quality events for the selected market.
              </p>
            </div>
            {dashboardSummaryQuery.isLoading ? (
              <LoadingSkeleton className="h-52" />
            ) : selectedAnomalies.length > 0 ? (
              <>
                <div className="hidden overflow-hidden border-y border-white/10 lg:block">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-2 py-3 pr-4">Type</th>
                        <th className="px-2 py-3 pr-4">Severity</th>
                        <th className="px-2 py-3 pr-4">Observed</th>
                        <th className="px-2 py-3 pr-4">Threshold</th>
                        <th className="px-2 py-3 pr-4">Detected at</th>
                        <th className="px-2 py-3">Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAnomalies.map((anomaly) => (
                        <AnomalyTableRow key={anomaly.id} anomaly={anomaly} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
                  {selectedAnomalies.map((anomaly) => (
                    <AnomalyMobileRow key={anomaly.id} anomaly={anomaly} />
                  ))}
                </div>
              </>
            ) : (
              <div className="border-y border-white/10 px-2 py-5 text-sm text-slate-400">
                No recent anomalies for this market.
              </div>
            )}
          </section>
        </>
      ) : null}
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
        eyebrow="Market Status"
        title={`${selectedSymbol} market is not in the current summary`}
        description="Market not found in current dashboard summary. Choose one of the currently monitored markets."
      />
      {availableSymbols.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {availableSymbols.map((entry) => (
            <Link
              key={entry.symbol}
              to={`/symbols/${entry.symbol}`}
              onClick={() => storeSelectedSymbol(entry.symbol)}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/25 hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              {entry.symbol}
            </Link>
          ))}
        </div>
      ) : (
        <FlatEmptyState message="No monitored markets are available from the current dashboard summary." />
      )}
    </section>
  );
}

function MetricStrip({
  healthScore,
  freshness,
  lastPrice,
  spread,
  statusTone,
  tradesPerMinute,
}: {
  healthScore: number | null;
  freshness: number | null;
  lastPrice: string | null;
  spread: number | null;
  statusTone: StatusTone;
  tradesPerMinute: number | null;
}) {
  return (
    <div className="grid gap-y-4 divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
      <MetricStripItem
        label="Health"
        value={healthScore === null ? "—" : `${healthScore}`}
        valueClassName={toneTextClass(statusTone)}
      />
      <MetricStripItem label="Last price" value={formatDisplayValue(lastPrice)} />
      <MetricStripItem label="Spread" value={formatDisplayPercent(spread)} />
      <MetricStripItem label="Trades/min" value={formatDisplayCompact(tradesPerMinute)} />
      <MetricStripItem label="Freshness" value={formatDisplayAge(freshness)} />
    </div>
  );
}

function MetricStripItem({
  label,
  value,
  valueClassName = "text-white",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:pl-0 md:last:pr-0">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tracking-tight ${valueClassName}`}>
        {value}
      </p>
    </div>
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

function InlineDataRow({
  label,
  value,
  valueClassName = "text-slate-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <dt className="text-sm text-slate-400">
        {label}
      </dt>
      <dd className={`text-right text-sm font-semibold ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function FlatEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 border-y border-white/[0.08] py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function AnomalyTableRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="px-2 py-3 pr-4">
        <StatusBadge
          status={toStatusTone(anomaly.severity, "neutral")}
          text={formatStatusLabel(anomaly.severity)}
        />
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatObservation(anomaly.observed_value)}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatObservation(anomaly.threshold_value)}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatDisplayTimestamp(anomaly.event_time)}
      </td>
      <td className="px-2 py-3 text-sm text-slate-400">
        {anomaly.message}
      </td>
    </tr>
  );
}

function AnomalyMobileRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  return (
    <article className="py-4">
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
      <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <InlineMobileValue label="Observed" value={formatObservation(anomaly.observed_value)} />
        <InlineMobileValue label="Threshold" value={formatObservation(anomaly.threshold_value)} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.message}</p>
    </article>
  );
}

function InlineMobileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function toneTextClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-200";
    case "degraded":
    case "warning":
      return "text-amber-200";
    case "unhealthy":
    case "critical":
      return "text-orange-200";
    case "info":
    case "ok":
      return "text-cyan-100";
    case "neutral":
    default:
      return "text-white";
  }
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

function formatMarketStatusLabel(
  symbol: DashboardSymbolSummary | null,
): string {
  if (!symbol || isDashboardSymbolPlaceholder(symbol)) {
    return "No data yet";
  }

  return formatStatusLabel(symbol.health?.status);
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
