import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import {
  useCatalogDashboardSummaryQuery,
  useMarketTimelineQuery,
} from "@/features/dashboard/api";
import { MarketHealthDesktopTable } from "@/features/dashboard/MarketHealthDesktopTable";
import { MarketHealthMobileCards } from "@/features/dashboard/MarketHealthMobileCards";
import { buildMarketHealthPreview } from "@/features/dashboard/marketHealthPreviewModel";
import { adaptMarketResourceToViewModel } from "@/features/dashboard/marketAdapters";
import type { MarketAnomalyViewModel, MarketDetailViewModel } from "@/features/dashboard/marketViewModel";
import { RecentAnomaliesDesktopTable } from "@/features/dashboard/RecentAnomaliesDesktopTable";
import { RecentAnomaliesMobileCards } from "@/features/dashboard/RecentAnomaliesMobileCards";
import { buildRecentAnomaliesPreview } from "@/features/dashboard/recentAnomaliesPreviewModel";
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
import { TimelinePanel } from "@/features/dashboard/TimelinePanel";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
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
  const selectedMarket = selectSignalSymbol(symbols, selectedSignalSymbol);
  const observed = selectedMarket?.availability === "observed";
  const timelineQuery = useMarketTimelineQuery(
    selectedMarket?.symbol ?? null,
    selectedUiMode,
    observed,
  );
  const emptyAnchorMs = Number.isFinite(timelineQuery.dataUpdatedAt)
    ? timelineQuery.dataUpdatedAt
    : 0;
  const timelineErrorMessage = timelineQuery.isError
    ? buildErrorMessage(timelineQuery.error)
    : null;

  return (
    <TimelinePanel
      selectedMarket={selectedMarket}
      timelinePoints={timelineQuery.data?.points ?? []}
      timelineAnomalies={timelineQuery.data?.anomalies ?? []}
      isSummaryLoading={isLoading}
      isTimelineLoading={timelineQuery.isLoading}
      timelineErrorMessage={timelineErrorMessage}
      onRetryTimeline={() => void timelineQuery.refetch()}
      emptyAnchorMs={emptyAnchorMs}
    />
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
          summary={summary}
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
  const preview = buildMarketHealthPreview(symbols);

  return (
    <section className="min-w-0 overflow-hidden space-y-3">
      <SectionTitle
        title="Market Health"
        subtitle="Current health signals for monitored markets."
        action={
          preview.hasMore ? (
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
      ) : !preview.isEmpty ? (
        <>
          <MarketHealthDesktopTable
            rows={preview.rows}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
          <MarketHealthMobileCards
            rows={preview.rows}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
        </>
      ) : (
        <EmptyBlock message="No monitored markets available." />
      )}
    </section>
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
        {symbol.availability === "observed" ? <div className="mt-4">
          <HealthScore
            score={symbol.health?.score ?? null}
            status={symbol.health?.status}
          />
        </div> : null}
        {symbol.availability === "observed" ? <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
        </div> : <div className="mt-4"><EmptyBlock message={availabilityMessage(symbol.availability)} /></div>}
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
  const preview = buildRecentAnomaliesPreview(anomalies);

  return (
    <section className="min-w-0 overflow-hidden space-y-3">
      <SectionTitle
        title="Recent Anomalies"
        subtitle="Latest data-quality events across monitored markets."
        action={
          preview.hasMore ? (
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
      ) : !preview.isEmpty ? (
        <>
          <RecentAnomaliesDesktopTable
            rows={preview.rows}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
          <RecentAnomaliesMobileCards
            rows={preview.rows}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
        </>
      ) : (
        <EmptyBlock message="No anomalies detected in the current summary." />
      )}
    </section>
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
  summary,
  onBack,
  onClose,
  onOpenSymbolDetail,
}: {
  identity: SymbolPopupIdentity;
  summary: DashboardSummary | null;
  onBack?: () => void;
  onClose: () => void;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const resourceState = useSymbolPopupResource(
    identity,
    summary?.symbols.find((entry) => entry.symbol === identity.symbol),
  );
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
            viewModel={adaptMarketResourceToViewModel(resourceState.resource, {
              mode: identity.mode,
              symbol: identity.symbol,
            })}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
        )}
      </div>
    </DashboardTableModal>
  );
}

function SymbolPopupSuccess({
  onOpenSymbolDetail,
  viewModel,
}: {
  viewModel: MarketDetailViewModel;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
  const { anomalies, identity, metrics, status } = viewModel;
  const observed = viewModel.availability === "observed";

  return (
    <div className="space-y-6" data-testid="symbol-popup-success">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-2xl font-bold text-white">
          {identity.symbol}
        </p>
        <StatusBadge
          status={status.tone}
          text={status.text}
        />
        <StatusBadge
          status="neutral"
          text={viewModel.source === "live" ? "Live" : "Demo"}
        />
      </div>

      {observed ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SymbolDetailMetric
          label="Health"
          value={viewModel.healthScore}
        />
        <SymbolDetailMetric
          label="Price"
          value={metrics.lastPrice}
        />
        <SymbolDetailMetric
          label="Spread"
          value={metrics.spread}
        />
        <SymbolDetailMetric
          label="Trades/min"
          value={metrics.tradesPerMinute}
        />
        <SymbolDetailMetric
          label="Freshness"
          value={metrics.freshness}
        />
        <SymbolDetailMetric
          label="Anomalies"
          value={metrics.anomalyCount}
        />
        <SymbolDetailMetric
          label="Best bid"
          value={metrics.bestBid}
        />
        <SymbolDetailMetric
          label="Best ask"
          value={metrics.bestAsk}
        />
      </div> : <EmptyBlock message={availabilityMessage(viewModel.availability)} />}

      {observed ? <section className="space-y-3">
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
                <SymbolDetailAnomalyCard
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
      </section> : null}
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

function SymbolDetailAnomalyRow({ anomaly }: { anomaly: MarketAnomalyViewModel }) {
  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-bold text-slate-100">
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        <SeverityBadge severity={anomaly.severity.key} />
      </td>
      <td className={`px-2 py-3 pr-4 text-sm font-bold ${anomaly.valueClassName}`}>
        {anomaly.observed.popup}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.threshold.popup}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.detected}
      </td>
      <td className="px-2 py-3 text-sm leading-5 text-slate-400">
        {anomaly.context}
      </td>
    </tr>
  );
}

function SymbolDetailAnomalyCard({
  anomaly,
  onOpenSymbolDetail,
}: {
  anomaly: MarketAnomalyViewModel;
  onOpenSymbolDetail: (symbol: string) => void;
}) {
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
          <p className="mt-2 text-base font-bold text-slate-100">{anomaly.type}</p>
        </div>
        <SeverityBadge severity={anomaly.severity.key} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileSymbolMetric label="Observed" value={anomaly.observed.popup} />
        <MobileSymbolMetric label="Threshold" value={anomaly.threshold.popup} />
        <MobileSymbolMetric label="Detected" value={anomaly.detected} />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Severity</p>
          <p className={`mt-1 text-sm font-bold ${anomaly.valueClassName}`}>
            {anomaly.severity.text}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.context}</p>
    </button>
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
  switch (symbol.availability) {
    case "configured": return "Configured";
    case "awaiting": return "Awaiting data";
    case "unavailable": return "Unavailable";
    case "observed": return statusLabel(symbol.health?.status);
  }
}

function availabilityMessage(availability: DashboardSymbolSummary["availability"]): string {
  switch (availability) {
    case "configured": return "Configured for Live; Live ingestion is not active.";
    case "awaiting": return "Awaiting first Live market data.";
    case "unavailable": return "Live market data is unavailable.";
    case "observed": return "No current market state available for this market.";
  }
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
