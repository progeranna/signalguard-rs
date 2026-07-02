import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
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
import { orderMarketEntries, orderMarkets } from "@/features/dashboard/marketOrder";
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

const DASHBOARD_TABLE_PREVIEW_LIMIT = 7;

type DashboardModalState =
  | { type: "anomalies" }
  | { type: "symbolDetail"; returnTo?: "anomalies" | "symbols"; symbol: string }
  | { type: "symbols" }
  | null;

export function DashboardPage() {
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = orderMarkets(summary?.symbols.map((symbol) => symbol.symbol) ?? []);
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
        <EmptyBlock message="No monitored market state available for the signal preview." />
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
            <div className="flex min-h-[285px] rounded-xl bg-slate-950/35">
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

          <aside className="flex h-full min-h-[285px] flex-col rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3">
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
            </div>
            <div className="mt-3 flex flex-1 flex-col justify-evenly gap-2">
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-slate-950/35 px-3 py-2.5">
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
  const [modalState, setModalState] = useState<DashboardModalState>(null);
  const symbols = orderMarketEntries(summary?.symbols ?? [], (symbol) => symbol.symbol);
  const anomalies = summary?.recent_anomalies ?? [];

  function isKnownSummarySymbol(symbol: string): boolean {
    const normalizedSymbol = normalizeSelectedSymbol(symbol);

    return (
      normalizedSymbol !== null &&
      symbols.some((entry) => normalizeSelectedSymbol(entry.symbol) === normalizedSymbol)
    );
  }

  function openSymbolDetail(symbol: string, returnTo?: "anomalies" | "symbols") {
    if (isKnownSummarySymbol(symbol)) {
      storeSelectedSymbol(symbol);
    }

    setModalState({ type: "symbolDetail", symbol, returnTo });
  }

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-2">
        <SymbolHealthShell
          onOpenAll={() => setModalState({ type: "symbols" })}
          onOpenSymbolDetail={(symbol) => openSymbolDetail(symbol)}
          summary={summary}
          isLoading={isLoading}
        />
        <RecentAnomaliesShell
          onOpenAll={() => setModalState({ type: "anomalies" })}
          onOpenSymbolDetail={(symbol) => openSymbolDetail(symbol)}
          summary={summary}
          isLoading={isLoading}
        />
      </section>
      {modalState?.type === "symbols" ? (
        <AllSymbolHealthModal
          symbols={symbols}
          onClose={() => setModalState(null)}
          onOpenSymbolDetail={(symbol) => openSymbolDetail(symbol, "symbols")}
        />
      ) : null}
      {modalState?.type === "anomalies" ? (
        <AllAnomaliesModal
          anomalies={anomalies}
          onClose={() => setModalState(null)}
          onOpenSymbolDetail={(symbol) => openSymbolDetail(symbol, "anomalies")}
        />
      ) : null}
      {modalState?.type === "symbolDetail" ? (
        <SymbolDetailModal
          anomalies={anomalies}
          onBackToAllAnomalies={
            modalState.returnTo === "anomalies"
              ? () => setModalState({ type: "anomalies" })
              : undefined
          }
          onBackToAllSymbols={
            modalState.returnTo === "symbols"
              ? () => setModalState({ type: "symbols" })
              : undefined
          }
          onClose={() => setModalState(null)}
          onOpenSymbolDetail={(symbol) =>
            openSymbolDetail(symbol, modalState.returnTo)
          }
          symbol={modalState.symbol}
          symbols={symbols}
        />
      ) : null}
    </>
  );
}

function SymbolHealthShell({
  onOpenAll,
  onOpenSymbolDetail,
  summary,
  isLoading,
}: {
  onOpenAll: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = orderMarketEntries(summary?.symbols ?? [], (symbol) => symbol.symbol);
  const previewSymbols = symbols.slice(0, DASHBOARD_TABLE_PREVIEW_LIMIT);

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Market Health"
        subtitle="Current health signals for monitored markets."
        action={
          symbols.length > DASHBOARD_TABLE_PREVIEW_LIMIT ? (
            <button
              type="button"
              onClick={onOpenAll}
              className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            >
              View all
            </button>
          ) : null
        }
      />
      {isLoading ? (
        <LoadingSkeleton className="h-44" />
      ) : symbols.length > 0 ? (
        <>
          <div className="hidden border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Market</th>
                  <th className="px-2 py-3 pr-4">Health Score</th>
                  <th className="px-2 py-3 pr-4">Last Price</th>
                  <th className="px-2 py-3 pr-4">Spread</th>
                  <th className="px-2 py-3 pr-4">Trades/min</th>
                  <th className="px-2 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewSymbols.map((symbol) => (
                  <SymbolHealthTableRow
                    key={symbol.symbol}
                    symbol={symbol}
                    onOpenSymbolDetail={onOpenSymbolDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {previewSymbols.map((symbol) => (
              <SymbolHealthCard
                key={symbol.symbol}
                symbol={symbol}
                onOpenSymbolDetail={onOpenSymbolDetail}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No monitored markets available." />
      )}
    </section>
  );
}

function SymbolHealthTableRow({
  onOpenSymbolDetail,
  symbol,
}: {
  onOpenSymbolDetail: (symbol: string) => void;
  symbol: DashboardSymbolSummary;
}) {
  const score = symbol.health?.score ?? null;
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  function handleOpenSymbol() {
    onOpenSymbolDetail(symbol.symbol);
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
      role="button"
      aria-label={`Open ${symbol.symbol} market detail`}
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

function SymbolHealthCard({
  onOpenSymbolDetail,
  symbol,
}: {
  onOpenSymbolDetail: (symbol: string) => void;
  symbol: DashboardSymbolSummary;
}) {
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  return (
    <button
      type="button"
      onClick={() => {
        onOpenSymbolDetail(symbol.symbol);
      }}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${symbol.symbol} market detail`}
    >
      <article>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono text-lg font-bold text-white">
              {symbol.symbol}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              View market detail
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
    </button>
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
  onOpenAll,
  onOpenSymbolDetail,
  summary,
  isLoading,
}: {
  onOpenAll: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const anomalies = summary?.recent_anomalies ?? [];
  const previewAnomalies = anomalies.slice(0, DASHBOARD_TABLE_PREVIEW_LIMIT);

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Recent Anomalies"
        subtitle="Latest data-quality events across monitored markets."
        action={
          anomalies.length > DASHBOARD_TABLE_PREVIEW_LIMIT ? (
            <button
              type="button"
              onClick={onOpenAll}
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
          <div className="hidden border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Time</th>
                  <th className="px-2 py-3 pr-4">Market</th>
                  <th className="px-2 py-3 pr-4">Type</th>
                  <th className="px-2 py-3 pr-4">Severity</th>
                  <th className="px-2 py-3 pr-4">Observed</th>
                  <th className="px-2 py-3">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {previewAnomalies.map((anomaly) => (
                  <AnomalyTableRow
                    key={anomaly.id}
                    anomaly={anomaly}
                    onOpenSymbolDetail={onOpenSymbolDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {previewAnomalies.map((anomaly) => (
              <AnomalyCard
                key={anomaly.id}
                anomaly={anomaly}
                onOpenSymbolDetail={onOpenSymbolDetail}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No anomalies detected in the current summary." />
      )}
    </section>
  );
}

function AnomalyTableRow({
  anomaly,
  onOpenSymbolDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  function handleOpenSymbol() {
    onOpenSymbolDetail(anomaly.symbol);
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
      role="button"
      aria-label={`Open ${anomaly.symbol} market detail`}
      onClick={handleOpenSymbol}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0"
    >
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="px-2 py-3 pr-4">
        <span className="font-mono text-sm font-bold text-slate-50">
          {anomaly.symbol}
        </span>
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

function AnomalyCard({
  anomaly,
  onOpenSymbolDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <button
      type="button"
      onClick={() => onOpenSymbolDetail(anomaly.symbol)}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${anomaly.symbol} market detail`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-base font-bold text-white transition">
            {anomaly.symbol}
          </span>
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
    </button>
  );
}

function AllAnomaliesModal({
  anomalies,
  onClose,
  onOpenSymbolDetail,
}: {
  anomalies: DashboardAnomaly[];
  onClose: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  return (
    <DashboardTableModal
      title="All anomalies"
      subtitle="Full available anomaly list from the current dashboard summary."
      dialogId="all-anomalies-title"
      onClose={onClose}
    >
      {anomalies.length > 0 ? (
        <>
          <div className="hidden overflow-hidden border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Market</th>
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
                  <AnomalyModalTableRow
                    key={anomaly.id}
                    anomaly={anomaly}
                    onOpenSymbolDetail={onOpenSymbolDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {anomalies.map((anomaly) => (
              <AnomalyModalCard
                key={anomaly.id}
                anomaly={anomaly}
                onOpenSymbolDetail={onOpenSymbolDetail}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="border-y border-white/10 px-2 py-6 text-sm text-slate-400">
          No anomalies in the current summary.
        </div>
      )}
    </DashboardTableModal>
  );
}

function AnomalyModalTableRow({
  anomaly,
  onOpenSymbolDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  function handleOpenSymbol() {
    onOpenSymbolDetail(anomaly.symbol);
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
      role="button"
      aria-label={`Open ${anomaly.symbol} market detail`}
      onClick={handleOpenSymbol}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0"
    >
      <td className="px-2 py-3 pr-4">
        <span className="font-mono text-sm font-bold text-slate-50 transition">
          {anomaly.symbol}
        </span>
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

function AnomalyModalCard({
  anomaly,
  onOpenSymbolDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <button
      type="button"
      onClick={() => onOpenSymbolDetail(anomaly.symbol)}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${anomaly.symbol} market detail`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-base font-bold text-white transition">
            {anomaly.symbol}
          </span>
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
    </button>
  );
}

function AllSymbolHealthModal({
  onOpenSymbolDetail,
  symbols,
  onClose,
}: {
  onOpenSymbolDetail: (symbol: string) => void;
  symbols: DashboardSymbolSummary[];
  onClose: () => void;
}) {
  return (
    <DashboardTableModal
      title="All markets"
      subtitle="Full available market list from the current dashboard summary."
      dialogId="all-symbol-health-title"
      onClose={onClose}
    >
      {symbols.length > 0 ? (
        <>
          <div className="hidden overflow-hidden border-y border-white/10 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-4">Market</th>
                  <th className="px-2 py-3 pr-4">Health Score</th>
                  <th className="px-2 py-3 pr-4">Last Price</th>
                  <th className="px-2 py-3 pr-4">Spread</th>
                  <th className="px-2 py-3 pr-4">Trades/min</th>
                  <th className="px-2 py-3 pr-4">Freshness</th>
                  <th className="px-2 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((symbol) => (
                  <SymbolHealthModalTableRow
                    key={symbol.symbol}
                    symbol={symbol}
                    onOpenSymbolDetail={onOpenSymbolDetail}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
            {symbols.map((symbol) => (
              <SymbolHealthCard
                key={symbol.symbol}
                symbol={symbol}
                onOpenSymbolDetail={onOpenSymbolDetail}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="border-y border-white/10 px-2 py-6 text-sm text-slate-400">
          No monitored markets available.
        </div>
      )}
    </DashboardTableModal>
  );
}

function SymbolHealthModalTableRow({
  onOpenSymbolDetail,
  symbol,
}: {
  onOpenSymbolDetail: (symbol: string) => void;
  symbol: DashboardSymbolSummary;
}) {
  const score = symbol.health?.score ?? null;
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  return (
    <SymbolHealthTableRowShell
      symbol={symbol}
      onOpenSymbolDetail={onOpenSymbolDetail}
      cells={
        <>
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
          <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
            {formatOptionalAge(symbol.state?.last_event_age_ms)}
          </td>
          <td className="px-2 py-3 text-right">
            <StatusBadge
              status={statusTone}
              text={statusLabel(symbol.health?.status)}
            />
          </td>
        </>
      }
    />
  );
}

function SymbolHealthTableRowShell({
  symbol,
  onOpenSymbolDetail,
  cells,
}: {
  symbol: DashboardSymbolSummary;
  onOpenSymbolDetail: (symbol: string) => void;
  cells: React.ReactNode;
}) {
  function handleOpenSymbol() {
    onOpenSymbolDetail(symbol.symbol);
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
      role="button"
      aria-label={`Open ${symbol.symbol} market detail`}
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
      {cells}
    </tr>
  );
}

function SymbolDetailModal({
  anomalies,
  onBackToAllAnomalies,
  onBackToAllSymbols,
  onClose,
  onOpenSymbolDetail,
  symbol,
  symbols,
}: {
  anomalies: DashboardAnomaly[];
  onBackToAllAnomalies?: () => void;
  onBackToAllSymbols?: () => void;
  onClose: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
  symbol: string;
  symbols: DashboardSymbolSummary[];
}) {
  const normalizedSymbol = normalizeSelectedSymbol(symbol);
  const selectedSymbol =
    symbols.find(
      (entry) => normalizeSelectedSymbol(entry.symbol) === normalizedSymbol,
    ) ?? null;
  const symbolAnomalies = selectedSymbol
    ? anomalies.filter(
        (anomaly) =>
          normalizeSelectedSymbol(anomaly.symbol) ===
          normalizeSelectedSymbol(selectedSymbol.symbol),
      )
    : [];
  const statusTone = toStatusTone(selectedSymbol?.health?.status, "neutral");
  const titleSymbol = selectedSymbol?.symbol ?? normalizedSymbol ?? "Unknown market";

  return (
    <DashboardTableModal
      title={`${titleSymbol} market details`}
      subtitle="Current market state from the dashboard summary."
      dialogId="symbol-detail-title"
      onClose={onClose}
      secondaryAction={
        onBackToAllSymbols || onBackToAllAnomalies ? (
          <button
            type="button"
            onClick={onBackToAllSymbols ?? onBackToAllAnomalies}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            {onBackToAllSymbols ? "Back to all markets" : "Back to all anomalies"}
          </button>
        ) : null
      }
    >
      {selectedSymbol ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-2xl font-bold text-white">
              {selectedSymbol.symbol}
            </p>
            <StatusBadge
              status={statusTone}
              text={statusLabel(selectedSymbol.health?.status)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SymbolDetailMetric
              label="Health"
              value={selectedSymbol.health?.score?.toString() ?? "Unknown"}
            />
            <SymbolDetailMetric
              label="Price"
              value={formatTickerPrice(selectedSymbol.state?.last_trade_price)}
            />
            <SymbolDetailMetric
              label="Spread"
              value={formatTickerPercent(selectedSymbol.state?.spread_pct)}
            />
            <SymbolDetailMetric
              label="Trades/min"
              value={formatOptionalCompact(selectedSymbol.state?.trades_per_minute)}
            />
            <SymbolDetailMetric
              label="Freshness"
              value={formatOptionalAge(selectedSymbol.state?.last_event_age_ms)}
            />
            <SymbolDetailMetric
              label="Anomalies"
              value={formatCompactNumber(symbolAnomalies.length)}
            />
            <SymbolDetailMetric
              label="Best bid"
              value={formatTickerPrice(selectedSymbol.state?.best_bid_price)}
            />
            <SymbolDetailMetric
              label="Best ask"
              value={formatTickerPrice(selectedSymbol.state?.best_ask_price)}
            />
          </div>

          <section className="space-y-3">
            <SectionTitle
              title="Recent market anomalies"
              subtitle="Quality events for this market in the current summary."
            />
            {symbolAnomalies.length > 0 ? (
              <>
                <div className="hidden overflow-hidden border-y border-white/10 lg:block">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-2 py-3 pr-4">Type</th>
                        <th className="px-2 py-3 pr-4">Severity</th>
                        <th className="px-2 py-3 pr-4">Observed</th>
                        <th className="px-2 py-3 pr-4">Threshold</th>
                        <th className="px-2 py-3 pr-4">Detected</th>
                        <th className="px-2 py-3">Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolAnomalies.map((anomaly) => (
                        <SymbolDetailAnomalyRow key={anomaly.id} anomaly={anomaly} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
                  {symbolAnomalies.map((anomaly) => (
                    <AnomalyModalCard
                      key={anomaly.id}
                      anomaly={anomaly}
                      onOpenSymbolDetail={onOpenSymbolDetail}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyBlock message="No recent anomalies for this market." />
            )}
          </section>
        </div>
      ) : (
        <EmptyBlock message="Market not found in the current dashboard summary." />
      )}
    </DashboardTableModal>
  );
}

function SymbolDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

function SymbolDetailAnomalyRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
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

function DashboardTableModal({
  children,
  dialogId,
  onClose,
  secondaryAction,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  dialogId: string;
  onClose: () => void;
  secondaryAction?: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
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
        aria-labelledby={dialogId}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex h-[min(88vh,56rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--sg-panel)] shadow-[0_24px_80px_rgba(2,6,23,0.6)]"
      >
        <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id={dialogId} className="text-xl font-bold tracking-tight text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm leading-5 text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            {secondaryAction}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </section>
    </div>
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
