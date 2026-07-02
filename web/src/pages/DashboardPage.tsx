import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import {
  normalizeSelectedSymbol,
  storeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
} from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { isApiError, isApiValidationError } from "@/shared/api/errors";
import {
  formatAgeMs,
  formatCompactNumber,
} from "@/shared/lib/format";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

const DASHBOARD_ANOMALY_PREVIEW_LIMIT = 20;

export function DashboardPage() {
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = summary?.symbols.map((symbol) => symbol.symbol) ?? [];
  const { selectedSymbol } = useSelectedSymbol(availableSymbols);

  return (
    <section className="space-y-3">
      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message={buildErrorMessage(dashboardSummaryQuery.error)}
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      <MarketSignalShell
        selectedSignalSymbol={selectedSymbol}
        summary={summary}
        isLoading={dashboardSummaryQuery.isLoading}
      />
      <DashboardTablesGrid summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
    </section>
  );
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

function MarketSignalShell({
  selectedSignalSymbol,
  summary,
  isLoading,
}: {
  selectedSignalSymbol: string;
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = summary?.symbols ?? [];
  const selectedSymbol = selectSignalSymbol(symbols, selectedSignalSymbol);
  const selectedAnomalies = selectedSymbol
    ? (summary?.recent_anomalies ?? []).filter(
        (anomaly) => anomaly.symbol === selectedSymbol.symbol,
      )
    : [];
  const signalSeries = selectedSymbol
    ? buildSignalSeries(selectedSymbol, selectedAnomalies)
    : [];
  const signalDomain = buildSignalDomain(signalSeries);
  const signalSeverity = highestAnomalySeverity(selectedAnomalies);

  return (
    <section>
      {isLoading ? (
        <LoadingSkeleton className="h-40" />
      ) : !selectedSymbol || signalSeries.length === 0 ? (
        <EmptyBlock message="No monitored symbol state available for the signal preview." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2.5 sm:px-4">
            <div className="mb-2">
              <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold text-white">
                <span>{selectedSymbol.symbol}</span>
                {signalSeverity ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${anomalyMarkerBadgeClass(
                      signalSeverity,
                    )}`}
                  >
                    {statusLabel(signalSeverity)} signal
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex min-h-[190px] rounded-xl border border-slate-700/70 bg-slate-950/70">
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={signalSeries}
                    margin={{ top: 4, right: 14, bottom: 2, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="qualitySignalFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#7EE45B" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#7EE45B" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(100,116,139,0.18)"
                      strokeDasharray="3 8"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      height={34}
                      label={{
                        value: "Preview sequence",
                        position: "insideBottom",
                        offset: -2,
                        fill: "#64748b",
                        fontSize: 11,
                      }}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickLine={false}
                      tickMargin={2}
                    />
                    <YAxis
                      axisLine={false}
                      domain={signalDomain}
                      label={{
                        value: "Quality signal",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 11,
                      }}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0E1822",
                        border: "1px solid rgba(148,163,184,0.18)",
                        borderRadius: "10px",
                        color: "#e2e8f0",
                      }}
                      formatter={(value) => [`${value}`, "Signal"]}
                      labelFormatter={() => "Summary-backed preview"}
                    />
                    {signalSeries
                      .filter((point) => point.severity)
                      .map((point) => (
                        <ReferenceLine
                          key={`marker-${point.label}`}
                          stroke={anomalySeverityColor(point.severity)}
                          strokeDasharray="3 4"
                          strokeOpacity={0.85}
                          x={point.label}
                        />
                      ))}
                    <Area
                      baseValue={signalDomain[0]}
                      dataKey="signal"
                      fill="url(#qualitySignalFill)"
                      isAnimationActive={false}
                      stroke="#7EE45B"
                      strokeWidth={2.4}
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <aside className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
            <div className="border-b border-white/10 pb-1.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold text-white">
                  {selectedSymbol.symbol}
                </p>
                <StatusBadge
                  status={toStatusTone(selectedSymbol.health?.status, "neutral")}
                  text={selectedSymbol.health?.status ?? "Unknown"}
                />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Signal Snapshot
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-300">
                Current summary-backed state
              </p>
            </div>
            <div className="mt-2 space-y-1">
              <SignalSnapshotMetric
                label="Price"
                value={formatTickerPrice(selectedSymbol.state?.last_trade_price)}
              />
              <SignalSnapshotMetric
                label="Spread"
                value={formatTickerPercent(selectedSymbol.state?.spread_pct)}
              />
              <SignalSnapshotMetric
                label="Trades/min"
                value={formatOptionalCompact(selectedSymbol.state?.trades_per_minute)}
              />
              <SignalSnapshotMetric
                label="Freshness"
                value={formatOptionalAge(
                  selectedSymbol.state?.last_event_age_ms ??
                    summary?.pipeline.last_message_age_ms,
                )}
              />
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function SignalSnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-slate-950/35 px-3 py-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function DashboardTablesGrid({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <SymbolHealthShell summary={summary} isLoading={isLoading} />
      <RecentAnomaliesShell summary={summary} isLoading={isLoading} />
    </section>
  );
}

function SymbolHealthShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = summary?.symbols ?? [];

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Symbol Health"
        subtitle="Current health signals for monitored symbols."
      />
      {isLoading ? (
        <LoadingSkeleton className="h-44" />
      ) : symbols.length > 0 ? (
        <>
          <div className="hidden max-h-72 overflow-y-auto border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Symbol</th>
                  <th className="px-2 py-3 pr-4">Health Score</th>
                  <th className="px-2 py-3 pr-4">Last Price</th>
                  <th className="px-2 py-3 pr-4">Spread</th>
                  <th className="px-2 py-3 pr-4">Trades/min</th>
                  <th className="px-2 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {symbols.slice(0, 8).map((symbol) => (
                  <SymbolHealthTableRow key={symbol.symbol} symbol={symbol} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {symbols.slice(0, 8).map((symbol) => (
              <SymbolHealthCard key={symbol.symbol} symbol={symbol} />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No symbol health data available" />
      )}
    </section>
  );
}

function SymbolHealthTableRow({ symbol }: { symbol: DashboardSymbolSummary }) {
  const navigate = useNavigate();
  const score = symbol.health?.score ?? null;
  const statusTone = toStatusTone(symbol.health?.status, "neutral");
  const detailRoute = `/symbols/${symbol.symbol}`;

  function handleOpenSymbol() {
    storeSelectedSymbol(symbol.symbol);
    navigate(detailRoute);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenSymbol();
    }
  }

  return (
    <tr
      tabIndex={0}
      role="link"
      aria-label={`Open ${symbol.symbol} detail`}
      onClick={handleOpenSymbol}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0"
    >
      <td className="px-2 py-3 pr-4">
        <div className="inline-flex items-center gap-3">
          <span className="font-mono text-base font-bold text-slate-50">
            {symbol.symbol}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            View
          </span>
        </div>
      </td>
      <td className="px-2 py-3 pr-4">
        <HealthScore score={score} status={symbol.health?.status} />
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-100">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatTickerPercent(symbol.state?.spread_pct)}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatOptionalCompact(symbol.state?.trades_per_minute)}
      </td>
      <td className="px-2 py-3 text-right">
        <StatusBadge
          status={statusTone}
          text={statusLabel(symbol.health?.status)}
        />
      </td>
    </tr>
  );
}

function SymbolHealthCard({ symbol }: { symbol: DashboardSymbolSummary }) {
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  return (
    <Link
      to={`/symbols/${symbol.symbol}`}
      onClick={() => storeSelectedSymbol(symbol.symbol)}
      className="block py-4 transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${symbol.symbol} detail`}
    >
      <article>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono text-lg font-bold text-white">
              {symbol.symbol}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              View symbol detail
            </p>
          </div>
          <StatusBadge
            status={statusTone}
            text={statusLabel(symbol.health?.status)}
          />
        </div>
        <div className="mt-4">
          <HealthScore
            score={symbol.health?.score ?? null}
            status={symbol.health?.status}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <MobileSymbolMetric
            label="Price"
            value={formatTickerPrice(symbol.state?.last_trade_price)}
          />
          <MobileSymbolMetric
            label="Spread"
            value={formatTickerPercent(symbol.state?.spread_pct)}
          />
          <MobileSymbolMetric
            label="Trades/min"
            value={formatOptionalCompact(symbol.state?.trades_per_minute)}
          />
          <MobileSymbolMetric
            label="Age"
            value={formatOptionalAge(symbol.state?.last_event_age_ms)}
          />
        </div>
      </article>
    </Link>
  );
}

function HealthScore({
  score,
  status,
}: {
  score: number | null;
  status: string | null | undefined;
}) {
  const tone = healthScoreTone(score, status);
  const width = score === null ? 18 : Math.max(score, 4);

  return (
    <div className="min-w-28">
      <div className="flex items-center gap-3">
        <span className={`text-lg font-extrabold ${healthScoreTextClass(tone)}`}>
          {score ?? "Unknown"}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70">
          <div
            className={`h-full rounded-full ${healthScoreBarClass(tone)}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MobileSymbolMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

function RecentAnomaliesShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const anomalies = summary?.recent_anomalies ?? [];
  const previewAnomalies = anomalies.slice(0, DASHBOARD_ANOMALY_PREVIEW_LIMIT);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Recent Anomalies"
        subtitle="Latest data-quality events across monitored symbols."
        action={
          anomalies.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            >
              View all
            </button>
          ) : null
        }
      />
      {isLoading ? (
        <LoadingSkeleton className="h-44" />
      ) : anomalies.length > 0 ? (
        <>
          <div className="hidden max-h-72 overflow-y-auto border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Time</th>
                  <th className="px-2 py-3 pr-4">Symbol</th>
                  <th className="px-2 py-3 pr-4">Type</th>
                  <th className="px-2 py-3 pr-4">Severity</th>
                  <th className="px-2 py-3 pr-4">Observed</th>
                  <th className="px-2 py-3">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {previewAnomalies.map((anomaly) => (
                  <AnomalyTableRow key={anomaly.id} anomaly={anomaly} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {previewAnomalies.map((anomaly) => (
              <AnomalyCard key={anomaly.id} anomaly={anomaly} />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No recent anomalies. Detector output is clean for the current summary window." />
      )}
      {isModalOpen ? (
        <AllAnomaliesModal
          anomalies={anomalies}
          onClose={() => setIsModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

function AnomalyTableRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="px-2 py-3 pr-4">
        <Link
          to={`/symbols/${anomaly.symbol}`}
          onClick={() => storeSelectedSymbol(anomaly.symbol)}
          className="font-mono text-sm font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {anomaly.symbol}
        </Link>
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-bold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="px-2 py-3 pr-4">
        <SeverityBadge severity={anomaly.severity} />
      </td>
      <td className={`px-2 py-3 pr-4 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed")}
      </td>
      <td className="px-2 py-3 text-sm font-semibold text-slate-300">
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.threshold_value, "threshold")}
      </td>
    </tr>
  );
}

function AnomalyCard({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <article className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/symbols/${anomaly.symbol}`}
            onClick={() => storeSelectedSymbol(anomaly.symbol)}
            className="font-mono text-base font-bold text-white transition hover:text-cyan-200"
          >
            {anomaly.symbol}
          </Link>
          <p className="mt-2 text-base font-bold text-slate-100">
            {formatAnomalyType(anomaly.anomaly_type)}
          </p>
        </div>
        <SeverityBadge severity={anomaly.severity} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileSymbolMetric
          label="Observed"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.observed_value,
            "observed",
          )}
        />
        <MobileSymbolMetric
          label="Threshold"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.threshold_value,
            "threshold",
          )}
        />
        <MobileSymbolMetric
          label="Time"
          value={formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
        />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Severity
          </p>
          <p className={`mt-1 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
            {statusLabel(anomaly.severity)}
          </p>
        </div>
      </div>
    </article>
  );
}

function AllAnomaliesModal({
  anomalies,
  onClose,
}: {
  anomalies: DashboardAnomaly[];
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-anomalies-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--sg-panel)] shadow-[0_24px_80px_rgba(2,6,23,0.6)]"
      >
        <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="all-anomalies-title" className="text-xl font-bold tracking-tight text-white">
              All anomalies
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">
              Full available anomaly list from the current dashboard summary.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {anomalies.length > 0 ? (
            <>
              <div className="hidden overflow-hidden border-y border-white/10 lg:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <th className="px-2 py-3 pr-4">Symbol</th>
                      <th className="px-2 py-3 pr-4">Type</th>
                      <th className="px-2 py-3 pr-4">Severity</th>
                      <th className="px-2 py-3 pr-4">Observed</th>
                      <th className="px-2 py-3 pr-4">Threshold</th>
                      <th className="px-2 py-3 pr-4">Detected at</th>
                      <th className="px-2 py-3">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((anomaly) => (
                      <AnomalyModalTableRow key={anomaly.id} anomaly={anomaly} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
                {anomalies.map((anomaly) => (
                  <AnomalyModalCard key={anomaly.id} anomaly={anomaly} />
                ))}
              </div>
            </>
          ) : (
            <div className="border-y border-white/10 px-2 py-6 text-sm text-slate-400">
              No anomalies in the current summary.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AnomalyModalTableRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4">
        <Link
          to={`/symbols/${anomaly.symbol}`}
          onClick={() => storeSelectedSymbol(anomaly.symbol)}
          className="font-mono text-sm font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {anomaly.symbol}
        </Link>
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-bold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="px-2 py-3 pr-4">
        <SeverityBadge severity={anomaly.severity} />
      </td>
      <td className={`px-2 py-3 pr-4 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed")}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.threshold_value, "threshold")}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="px-2 py-3 text-sm leading-5 text-slate-400">
        {anomaly.message || "—"}
      </td>
    </tr>
  );
}

function AnomalyModalCard({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <article className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/symbols/${anomaly.symbol}`}
            onClick={() => storeSelectedSymbol(anomaly.symbol)}
            className="font-mono text-base font-bold text-white transition hover:text-cyan-200"
          >
            {anomaly.symbol}
          </Link>
          <p className="mt-2 text-base font-bold text-slate-100">
            {formatAnomalyType(anomaly.anomaly_type)}
          </p>
        </div>
        <SeverityBadge severity={anomaly.severity} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileSymbolMetric
          label="Observed"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.observed_value,
            "observed",
          )}
        />
        <MobileSymbolMetric
          label="Threshold"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.threshold_value,
            "threshold",
          )}
        />
        <MobileSymbolMetric
          label="Detected"
          value={formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
        />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Severity
          </p>
          <p className={`mt-1 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
            {statusLabel(anomaly.severity)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        {anomaly.message || "—"}
      </p>
    </article>
  );
}

function SectionTitle({
  title,
  action,
  subtitle,
}: {
  title: string;
  action?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm leading-5 text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      {action ? (
        <div className="shrink-0 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100">
          {action}
        </div>
      ) : null}
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

function selectSignalSymbol(
  symbols: DashboardSymbolSummary[],
  preferredSymbol: string,
): DashboardSymbolSummary | null {
  const normalizedPreferredSymbol = normalizeSelectedSymbol(preferredSymbol);

  return (
    symbols.find(
      (symbol) => normalizeSelectedSymbol(symbol.symbol) === normalizedPreferredSymbol,
    ) ??
    symbols.find((symbol) => normalizeSelectedSymbol(symbol.symbol) === "BTCUSDT") ??
    symbols[0] ??
    null
  );
}

type SignalPoint = {
  label: string;
  signal: number;
  severity?: DashboardAnomaly["severity"];
};

function buildSignalSeries(
  symbol: DashboardSymbolSummary,
  anomalies: DashboardAnomaly[],
): SignalPoint[] {
  const score = symbol.health?.score ?? 55;
  const spread = symbol.state?.spread_pct ?? 0;
  const tradeRate = symbol.state?.trades_per_minute ?? 0;
  const agePenalty = Math.min((symbol.state?.last_event_age_ms ?? 0) / 30_000, 8);
  const anomalyPenalty = Math.min(anomalies.length * 3, 12);
  const base = clamp(score - spread * 20 - agePenalty - anomalyPenalty, 18, 94);
  const activity = clamp(tradeRate / 12, 0, 7);
  const statusLift =
    symbol.health?.status === "healthy"
      ? 4
      : symbol.health?.status === "degraded"
        ? -3
        : symbol.health?.status === "unhealthy"
          ? -9
          : 0;

  const anomalySlots = anomalies.slice(0, 5).map((anomaly, index) => ({
    slot: Math.round(((index + 1) * 8) / (Math.min(anomalies.length, 5) + 1)),
    severity: anomaly.severity,
  }));

  return [
    ["S1", clamp(base - 6 + statusLift, 6, 98)],
    ["S2", clamp(base - 1 + activity, 6, 98)],
    ["S3", clamp(base + 4 + statusLift / 2, 6, 98)],
    ["S4", clamp(base + 1 - anomalyPenalty / 2, 6, 98)],
    ["S5", clamp(base + 6 - agePenalty, 6, 98)],
    ["S6", clamp(base + 2 + activity / 2, 6, 98)],
    ["S7", clamp(base + statusLift - anomalyPenalty / 3, 6, 98)],
    ["S8", clamp(base + 5 - spread * 8, 6, 98)],
  ].map(([label, signal], index) => ({
    label: String(label),
    severity: anomalySlots.find((marker) => marker.slot === index + 1)?.severity,
    signal: Number(signal),
  }));
}

function buildSignalDomain(series: SignalPoint[]): [number, number] {
  if (series.length === 0) {
    return [0, 100];
  }

  const values = series.map((point) => point.signal);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(high - low, 1);
  const targetRange = Math.max(range + 2, 8);
  const midpoint = (low + high) / 2;

  return [
    clamp(Math.floor(midpoint - targetRange / 2), 0, 100),
    clamp(Math.ceil(midpoint + targetRange / 2), 0, 100),
  ];
}

function anomalySeverityColor(severity: DashboardAnomaly["severity"] | undefined): string {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function highestAnomalySeverity(
  anomalies: DashboardAnomaly[],
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

function anomalyMarkerBadgeClass(severity: DashboardAnomaly["severity"]): string {
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

function SeverityBadge({ severity }: { severity: DashboardAnomaly["severity"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${severityBadgeClass(
        severity,
      )}`}
    >
      {statusLabel(severity)}
    </span>
  );
}

function severityBadgeClass(severity: DashboardAnomaly["severity"]): string {
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

function anomalyValueClass(severity: StatusTone): string {
  switch (severity) {
    case "critical":
      return "text-rose-300";
    case "warning":
      return "text-amber-300";
    case "info":
      return "text-sky-200";
    default:
      return "text-slate-300";
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

function formatAnomalyTime(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAnomalyValue(
  type: string,
  value: number | null | undefined,
  role: "observed" | "threshold",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  switch (type) {
    case "spread_spike":
    case "price_move":
      return `${value.toFixed(3)}%`;
    case "event_lag_spike":
      return formatDurationValue(value);
    case "stale_data":
    case "quote_stuck":
      return formatDurationValue(value);
    case "trade_burst":
      return `${formatIntegerValue(value)} /m`;
    case "depth_sequence_gap":
      return `${formatIntegerValue(value)} ${role === "threshold" ? "limit" : "gap"}`;
    default:
      return formatNumericValue(value);
  }
}

function formatDurationValue(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} s`;
  }

  return `${formatNumericValue(value)} ms`;
}

function formatIntegerValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

function healthScoreTone(
  score: number | null,
  status: string | null | undefined,
): StatusTone {
  if (status === "healthy" || (score !== null && score >= 80)) {
    return "healthy";
  }

  if (status === "degraded" || (score !== null && score >= 50)) {
    return "degraded";
  }

  if (status === "unhealthy" || (score !== null && score < 50)) {
    return "unhealthy";
  }

  return "neutral";
}

function healthScoreTextClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function healthScoreBarClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "bg-emerald-300";
    case "degraded":
      return "bg-amber-300";
    case "unhealthy":
    case "critical":
      return "bg-rose-300";
    default:
      return "bg-slate-500";
  }
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

function statusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.message} (${error.status})`;
  }

  if (isApiValidationError(error)) {
    return error.message;
  }

  return "The dashboard summary request did not complete successfully.";
}
