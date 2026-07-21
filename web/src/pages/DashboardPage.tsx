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

import {
  useCatalogDashboardSummaryQuery,
  useMarketTimelineQuery,
} from "@/features/dashboard/api";
import { isDashboardSymbolPlaceholder } from "@/features/dashboard/marketOrder";
import {
  normalizeSelectedSymbol,
  storeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import {
  createSymbolPopupIdentity,
  replaceSymbolPopupMode,
  symbolPopupIdentityKey,
  type SymbolPopupIdentity,
  type SymbolPopupReturnContext,
} from "@/features/dashboard/symbolPopup";
import { useSymbolPopupResource } from "@/features/dashboard/symbolPopupResource";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  MarketTimelinePoint,
  UiMode,
} from "@/features/dashboard/types";
import { useResolvedUiMode } from "@/features/dashboard/uiMode";
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
  | { type: "symbolDetail"; identity: SymbolPopupIdentity }
  | { type: "symbols" }
  | null;

export function DashboardPage() {
  const selectedUiMode = useResolvedUiMode();
  const dashboardSummaryQuery = useCatalogDashboardSummaryQuery(selectedUiMode);
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = (summary?.symbols ?? []).map(
    (symbol) => symbol.symbol,
  );
  const { selectedSymbol } = useSelectedSymbol(
    selectedUiMode,
    availableSymbols,
  );

  return (
    <section className="space-y-3">
      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message={buildErrorMessage(dashboardSummaryQuery.error)}
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      <MarketTimelineShell
        selectedUiMode={selectedUiMode}
        selectedSignalSymbol={selectedSymbol}
        summary={summary}
        isLoading={dashboardSummaryQuery.isLoading}
      />
      <DashboardTablesGrid
        summary={summary}
        isLoading={dashboardSummaryQuery.isLoading}
        selectedUiMode={selectedUiMode}
      />
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

function MarketTimelineShell({
  selectedUiMode,
  selectedSignalSymbol,
  summary,
  isLoading,
}: {
  selectedUiMode: UiMode;
  selectedSignalSymbol: string | null;
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = summary?.symbols ?? [];
  const selectedSymbol = selectSignalSymbol(symbols, selectedSignalSymbol);
  const timelineQuery = useMarketTimelineQuery(selectedSymbol?.symbol ?? null, selectedUiMode);
  const timelinePoints = buildTimelineChartPoints(timelineQuery.data?.points ?? []);
  const timelinePriceDomain = buildTimelinePriceDomain(timelinePoints);
  const timelineTimeDomain = buildTimelineTimeDomain(timelinePoints);
  const timelineAnomalies = timelineQuery.data?.anomalies ?? [];
  const visibleTimelineAnomalies = buildVisibleTimelineAnomalies(
    timelineAnomalies,
    timelineTimeDomain,
  );
  const timelineSeverity = highestAnomalySeverity(timelineAnomalies);
  const statusText = selectedSymbol ? marketStatusLabel(selectedSymbol) : "No data yet";
  const statusTone = toStatusTone(selectedSymbol?.health?.status, "neutral");

  return (
    <section>
      {isLoading ? (
        <LoadingSkeleton className="h-40" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2.5 sm:px-4">
            {selectedSymbol ? (
              <>
                <div className="mb-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold text-white">
                    <span>{selectedSymbol.symbol}</span>
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
                {timelineQuery.isError ? (
                  <ErrorPanel
                    title="Market timeline unavailable"
                    message={buildErrorMessage(timelineQuery.error)}
                    onRetry={() => void timelineQuery.refetch()}
                  />
                ) : timelineQuery.isLoading ? (
                  <LoadingSkeleton className="h-[320px]" />
                ) : timelinePoints.length === 0 ? (
                  <div className="border-y border-white/10 px-2 py-10 text-sm leading-6 text-slate-400">
                    Waiting for market data
                  </div>
                ) : (
                  <>
                    <div className="flex min-h-[285px] rounded-xl bg-slate-950/35">
                      <div className="relative min-h-0 flex-1 overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={timelinePoints}
                            margin={{ top: 4, right: 14, bottom: 2, left: 0 }}
                          >
                            <defs>
                              <linearGradient id="marketTimelineFill" x1="0" x2="0" y1="0" y2="1">
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
                              dataKey="timestampMs"
                              domain={timelineTimeDomain}
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
                              domain={timelinePriceDomain}
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
                            <Tooltip content={<TimelineTooltip anomalies={timelineAnomalies} />} />
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
                  </>
                )}
              </>
            ) : (
              <EmptyBlock message="Waiting for market data" />
            )}
          </div>

          <aside className="flex h-full min-h-[285px] flex-col rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3">
            <div className="border-b border-white/10 pb-1.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold text-white">
                  {selectedSymbol?.symbol ?? "Unknown market"}
                </p>
                <StatusBadge
                  status={statusTone}
                  text={statusText}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-1 flex-col justify-evenly gap-2">
              <SignalSnapshotMetric
                label="Price"
                value={formatTickerPrice(selectedSymbol?.state?.last_trade_price)}
              />
              <SignalSnapshotMetric
                label="Spread"
                value={formatTickerPercent(selectedSymbol?.state?.spread_pct)}
              />
              <SignalSnapshotMetric
                label="Trades/min"
                value={formatOptionalCompact(selectedSymbol?.state?.trades_per_minute)}
              />
              <SignalSnapshotMetric
                label="Freshness"
                value={formatOptionalAge(
                  selectedSymbol?.state?.last_event_age_ms ?? summary?.pipeline.last_message_age_ms,
                )}
              />
            </div>
          </aside>
        </div>
      )}
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
  anomalies: DashboardAnomaly[];
  label?: number;
  payload?: Array<{ payload: MarketTimelineChartPoint }>;
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

    return Number.isFinite(anomalyTime) && Math.abs(anomalyTime - point.timestampMs) <= 15_000;
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
        {formatTimelineTooltipTimestamp(typeof label === "number" ? new Date(label).toISOString() : point.timestamp)}
      </p>
      <div className="mt-2 space-y-1 text-slate-300">
        <p>Price: {point.priceLabel}</p>
        {point.spreadPct !== null ? <p>Spread: {formatTickerPercent(point.spreadPct)}</p> : null}
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
                  `${formatAnomalyType(anomaly.anomaly_type)} (${statusLabel(anomaly.severity)})`,
              )
              .join(", ")}
          </p>
        ) : null}
      </div>
    </div>
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
  selectedUiMode,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
  selectedUiMode: UiMode;
}) {
  const [modalState, setModalState] = useState<DashboardModalState>(null);
  const symbols = summary?.symbols ?? [];
  const anomalies = summary?.recent_anomalies ?? [];
  const activePopupIdentity =
    modalState?.type === "symbolDetail"
      ? modalState.identity.mode === selectedUiMode
        ? modalState.identity
        : replaceSymbolPopupMode(modalState.identity, selectedUiMode)
      : null;

  useEffect(() => {
    setModalState((currentState) => {
      if (
        currentState?.type !== "symbolDetail" ||
        currentState.identity.mode === selectedUiMode
      ) {
        return currentState;
      }

      return {
        type: "symbolDetail",
        identity: replaceSymbolPopupMode(
          currentState.identity,
          selectedUiMode,
        ),
      };
    });
  }, [selectedUiMode]);

  function isKnownSummarySymbol(symbol: string): boolean {
    const normalizedSymbol = normalizeSelectedSymbol(symbol);

    return (
      normalizedSymbol !== null &&
      symbols.some((entry) => normalizeSelectedSymbol(entry.symbol) === normalizedSymbol)
    );
  }

  function openSymbolDetail(
    symbol: string,
    returnContext: SymbolPopupReturnContext,
  ) {
    const identity = createSymbolPopupIdentity(
      selectedUiMode,
      symbol,
      returnContext,
    );

    if (!identity) {
      return;
    }

    if (isKnownSummarySymbol(identity.symbol)) {
      storeSelectedSymbol(identity.mode, identity.symbol);
    }

    setModalState({ type: "symbolDetail", identity });
  }

  return (
    <>
      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SymbolHealthShell
          onOpenAll={() => setModalState({ type: "symbols" })}
          onOpenSymbolDetail={(symbol) =>
            openSymbolDetail(symbol, "dashboard")
          }
          summary={summary}
          isLoading={isLoading}
        />
        <RecentAnomaliesShell
          onOpenAll={() => setModalState({ type: "anomalies" })}
          onOpenSymbolDetail={(symbol) =>
            openSymbolDetail(symbol, "dashboard")
          }
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
      {activePopupIdentity ? (
        <SymbolDetailModal
          key={symbolPopupIdentityKey(activePopupIdentity)}
          identity={activePopupIdentity}
          onBack={
            activePopupIdentity.returnContext === "symbols"
              ? () => setModalState({ type: "symbols" })
              : activePopupIdentity.returnContext === "anomalies"
                ? () => setModalState({ type: "anomalies" })
                : undefined
          }
          onClose={() => setModalState(null)}
          onOpenSymbolDetail={(symbol) =>
            openSymbolDetail(
              symbol,
              activePopupIdentity.returnContext,
            )
          }
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
  const symbols = summary?.symbols ?? [];
  const previewSymbols = symbols.slice(0, DASHBOARD_TABLE_PREVIEW_LIMIT);

  return (
    <section className="min-w-0 overflow-hidden space-y-3">
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
          <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block">
            <table aria-label="Market health" className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[14%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-2">Market</th>
                  <th className="px-2 py-3 pr-2">Health Score</th>
                  <th className="px-2 py-3 pr-2">Last Price</th>
                  <th className="px-2 py-3 pr-2">Spread</th>
                  <th className="px-2 py-3 pr-2">Trades/min</th>
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
  const statusText = marketStatusLabel(symbol);

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
      <td className="min-w-0 px-2 py-3 pr-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-mono text-sm font-bold text-slate-50">
            {symbol.symbol}
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:inline">
            View
          </span>
        </div>
      </td>
      <td className="px-2 py-3 pr-4">
        <HealthScore compact score={score} status={symbol.health?.status} />
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-100 2xl:text-sm">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {formatTickerPercent(symbol.state?.spread_pct)}
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {formatOptionalCompact(symbol.state?.trades_per_minute)}
      </td>
      <td className="px-2 py-3 text-right">
        <div className="flex min-w-0 justify-end overflow-hidden">
          <StatusBadge status={statusTone} text={statusText} />
        </div>
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
  const statusText = marketStatusLabel(symbol);

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
            text={statusText}
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
  compact = false,
  score,
  status,
}: {
  compact?: boolean;
  score: number | null;
  status: string | null | undefined;
}) {
  const tone = healthScoreTone(score, status);
  const width = score === null ? 0 : Math.max(score, 4);

  return (
    <div className={compact ? "min-w-0" : "min-w-28"}>
      <div className={compact ? "flex min-w-0 items-center gap-2" : "flex items-center gap-3"}>
        <span className={`text-lg font-extrabold ${healthScoreTextClass(tone)}`}>
          {score ?? "—"}
        </span>
        <div
          className={
            compact
              ? "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/70"
              : "h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70"
          }
        >
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
    <section className="min-w-0 overflow-hidden space-y-3">
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
          <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block">
            <table aria-label="Recent anomalies" className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[19%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-2 py-3 pr-2">Time</th>
                  <th className="px-2 py-3 pr-2">Market</th>
                  <th className="px-2 py-3 pr-2">Type</th>
                  <th className="px-2 py-3 pr-2">Severity</th>
                  <th className="px-2 py-3 pr-2">Observed</th>
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
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="min-w-0 px-2 py-3 pr-2">
        <span className="block min-w-0 truncate font-mono text-xs font-bold text-slate-50 2xl:text-sm">
          {anomaly.symbol}
        </span>
      </td>
      <td className="min-w-0 break-words px-2 py-3 pr-2 text-xs font-bold leading-4 text-slate-100 2xl:text-sm">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="min-w-0 px-2 py-3 pr-2">
        <SeverityBadge compact severity={anomaly.severity} />
      </td>
      <td className={`whitespace-nowrap px-2 py-3 pr-2 text-xs font-bold 2xl:text-sm ${anomalyValueClass(severityTone)}`}>
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed")}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-300 2xl:text-sm">
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
  const statusText = marketStatusLabel(symbol);

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
              text={statusText}
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
  identity,
  onBack,
  onClose,
  onOpenSymbolDetail,
}: {
  identity: SymbolPopupIdentity;
  onBack?: () => void;
  onClose: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const resourceState = useSymbolPopupResource(identity);
  const backLabel =
    identity.returnContext === "symbols"
      ? "Back to all markets"
      : identity.returnContext === "anomalies"
        ? "Back to all anomalies"
        : null;

  if (
    resourceState.status === "success" &&
    (resourceState.resource.mode !== identity.mode ||
      resourceState.resource.symbol !== identity.symbol)
  ) {
    throw new TypeError(
      `popup resource identity mismatch: expected ${identity.mode}/${identity.symbol}`,
    );
  }

  return (
    <DashboardTableModal
      title={`${identity.symbol} market details`}
      subtitle={`Current ${identity.mode === "demo" ? "Demo" : "Live"} market state from the dashboard summary.`}
      dialogId="symbol-detail-title"
      onClose={onClose}
      secondaryAction={
        onBack && backLabel ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            {backLabel}
          </button>
        ) : null
      }
    >
      <div
        data-popup-identity={`${identity.mode}:${identity.symbol}:${identity.returnContext}`}
      >
        {resourceState.status === "loading" ? (
          <div
            aria-live="polite"
            className="space-y-3"
            data-testid="symbol-popup-loading"
          >
            <p className="text-sm text-slate-400">
              Loading {identity.symbol} market details for {identity.mode === "demo" ? "Demo" : "Live"} mode.
            </p>
            <LoadingSkeleton className="h-64" />
          </div>
        ) : resourceState.status === "error" ? (
          <ErrorPanel
            title={`${identity.symbol} market details unavailable`}
            message={buildErrorMessage(resourceState.error)}
            onRetry={() => void resourceState.refetch()}
          />
        ) : resourceState.status === "unavailable" ? (
          <EmptyBlock
            message={`${identity.symbol} is unavailable in ${identity.mode === "demo" ? "Demo" : "Live"} mode.`}
          />
        ) : (
          <SymbolPopupSuccess
            anomalies={resourceState.resource.anomalies}
            onOpenSymbolDetail={onOpenSymbolDetail}
            symbol={resourceState.resource.summary}
          />
        )}
      </div>
    </DashboardTableModal>
  );
}

function SymbolPopupSuccess({
  anomalies,
  onOpenSymbolDetail,
  symbol,
}: {
  anomalies: DashboardAnomaly[];
  onOpenSymbolDetail: (symbol: string) => void;
  symbol: DashboardSymbolSummary;
}) {
  const statusTone = toStatusTone(symbol.health?.status, "neutral");
  const statusText = marketStatusLabel(symbol);

  return (
    <div className="space-y-6" data-testid="symbol-popup-success">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-2xl font-bold text-white">
          {symbol.symbol}
        </p>
        <StatusBadge
          status={statusTone}
          text={statusText}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SymbolDetailMetric
          label="Health"
          value={symbol.health?.score?.toString() ?? "—"}
        />
        <SymbolDetailMetric
          label="Price"
          value={formatTickerPrice(symbol.state?.last_trade_price)}
        />
        <SymbolDetailMetric
          label="Spread"
          value={formatTickerPercent(symbol.state?.spread_pct)}
        />
        <SymbolDetailMetric
          label="Trades/min"
          value={formatOptionalCompact(symbol.state?.trades_per_minute)}
        />
        <SymbolDetailMetric
          label="Freshness"
          value={formatOptionalAge(symbol.state?.last_event_age_ms)}
        />
        <SymbolDetailMetric
          label="Anomalies"
          value={formatCompactNumber(anomalies.length)}
        />
        <SymbolDetailMetric
          label="Best bid"
          value={formatTickerPrice(symbol.state?.best_bid_price)}
        />
        <SymbolDetailMetric
          label="Best ask"
          value={formatTickerPrice(symbol.state?.best_ask_price)}
        />
      </div>

      <section className="space-y-3">
        <SectionTitle
          title="Recent market anomalies"
          subtitle="Quality events for this market in the current summary."
        />
        {anomalies.length > 0 ? (
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
                  {anomalies.map((anomaly) => (
                    <SymbolDetailAnomalyRow key={anomaly.id} anomaly={anomaly} />
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
          <EmptyBlock message="No recent anomalies for this market." />
        )}
      </section>
    </div>
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
  preferredSymbol: string | null,
): DashboardSymbolSummary | null {
  const normalizedPreferredSymbol = normalizeSelectedSymbol(preferredSymbol);

  if (!normalizedPreferredSymbol) {
    return null;
  }

  return (
    symbols.find(
      (symbol) => normalizeSelectedSymbol(symbol.symbol) === normalizedPreferredSymbol,
    ) ?? null
  );
}

type MarketTimelineChartPoint = {
  timestamp: string;
  timestampMs: number;
  price: number;
  priceLabel: string;
  spreadPct: number | null;
  tradesPerMinute: number | null;
  lastEventAgeMs: number | null;
};

function buildTimelineChartPoints(points: MarketTimelinePoint[]): MarketTimelineChartPoint[] {
  return points
    .map((point) => {
      const timestampMs = Date.parse(point.timestamp);
      const price = Number(point.price);

      if (!Number.isFinite(timestampMs) || !Number.isFinite(price)) {
        return null;
      }

      return {
        timestamp: point.timestamp,
        timestampMs,
        price,
        priceLabel: point.price,
        spreadPct: point.spread_pct,
        tradesPerMinute: point.trades_per_minute,
        lastEventAgeMs: point.last_event_age_ms,
      } satisfies MarketTimelineChartPoint;
    })
    .filter((point): point is MarketTimelineChartPoint => point !== null);
}

function buildTimelinePriceDomain(points: MarketTimelineChartPoint[]): [number, number] {
  if (points.length === 0) {
    return [0, 1];
  }

  const values = points.map((point) => point.price);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(high - low, 0.0001);
  const padding = Math.max(range * 0.08, Math.abs(high) * 0.002, 0.01);

  return [low - padding, high + padding];
}

function buildTimelineTimeDomain(points: MarketTimelineChartPoint[]): [number, number] {
  if (points.length === 0) {
    const now = Date.now();

    return [now - 60_000, now];
  }

  if (points.length === 1) {
    const timestamp = points[0].timestampMs;

    return [timestamp - 60_000, timestamp + 60_000];
  }

  return [points[0].timestampMs, points[points.length - 1].timestampMs];
}

function buildVisibleTimelineAnomalies(
  anomalies: DashboardAnomaly[],
  timeDomain: [number, number],
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
      (anomaly): anomaly is DashboardAnomaly & { timestampMs: number } =>
        anomaly !== null &&
        anomaly.timestampMs >= timeDomain[0] &&
        anomaly.timestampMs <= timeDomain[1],
    );
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

function SeverityBadge({
  compact = false,
  severity,
}: {
  compact?: boolean;
  severity: DashboardAnomaly["severity"];
}) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase ${
        compact
          ? "px-2 py-1 text-[10px] tracking-[0.08em] 2xl:px-2.5 2xl:text-xs 2xl:tracking-[0.12em]"
          : "px-2.5 py-1 text-xs tracking-[0.12em]"
      } ${severityBadgeClass(severity)}`}
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

function formatTimelineTooltipTimestamp(value: string | null | undefined): string {
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

function marketStatusLabel(symbol: DashboardSymbolSummary): string {
  if (isDashboardSymbolPlaceholder(symbol)) {
    return "No data yet";
  }

  return statusLabel(symbol.health?.status);
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
