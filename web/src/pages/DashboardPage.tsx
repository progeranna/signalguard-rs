import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  useCatalogDashboardSummaryQuery,
  useMarketTimelineQuery,
} from "@/features/dashboard/api";
import { MarketHealthDesktopTable } from "@/features/dashboard/MarketHealthDesktopTable";
import { MarketHealthMobileCards } from "@/features/dashboard/MarketHealthMobileCards";
import { HealthScore } from "@/features/dashboard/HealthScore";
import { buildMarketHealthPreview } from "@/features/dashboard/marketHealthPreviewModel";
import { adaptMarketResourceToViewModel } from "@/features/dashboard/marketAdapters";
import type { MarketDetailViewModel } from "@/features/dashboard/marketViewModel";
import {
  availabilityMessage,
  formatOptionalAge,
  formatOptionalCompact,
  formatTickerPercent,
  formatTickerPrice,
  marketStatusLabel,
  statusLabel,
} from "@/features/dashboard/marketHealthPresentation";
import { RecentAnomaliesDesktopTable } from "@/features/dashboard/RecentAnomaliesDesktopTable";
import { RecentAnomaliesMobileCards } from "@/features/dashboard/RecentAnomaliesMobileCards";
import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyType,
  formatAnomalyValue,
  severityBadgeClass,
} from "@/features/dashboard/recentAnomaliesPresentation";
import { buildRecentAnomaliesPreview } from "@/features/dashboard/recentAnomaliesPreviewModel";
import { SymbolDetailAnomalies } from "@/features/dashboard/SymbolDetailAnomalies";
import { SymbolDetailHeader } from "@/features/dashboard/SymbolDetailHeader";
import { SymbolDetailMetrics } from "@/features/dashboard/SymbolDetailMetrics";
import {
  normalizeSelectedSymbol,
  storeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import {
  createSymbolPopupIdentity,
  replaceSymbolPopupMode,
  replaceSymbolPopupSymbol,
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
import { toStatusTone } from "@/shared/lib/status";

type DashboardModalState =
  | { type: "anomalies"; focusAnomalyId?: string }
  | {
      type: "anomalyDetail";
      anomalyId: string;
      returnContext: "anomalies" | "dashboard";
    }
  | {
      type: "symbolAnomalyDetail";
      anomalyId: string;
      parentIdentity: SymbolPopupIdentity;
    }
  | {
      type: "symbolDetail";
      identity: SymbolPopupIdentity;
      focusAnomalyId?: string;
    }
  | { type: "symbols"; focusSymbol?: string }
  | null;

const EMPTY_DASHBOARD_ANOMALIES: DashboardAnomaly[] = [];

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
        selectedSymbol={selectedSymbol}
      />
    </section>
  );
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
  selectedSymbol,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
  selectedUiMode: UiMode;
  selectedSymbol: string | null;
}) {
  const [modalState, setModalState] = useState<DashboardModalState>(null);
  const previousUiModeRef = useRef(selectedUiMode);
  const symbols = summary?.symbols ?? [];
  const anomalies =
    summary?.source === selectedUiMode
      ? summary.recent_anomalies
      : EMPTY_DASHBOARD_ANOMALIES;
  const activeAnomaly =
    modalState?.type === "anomalyDetail"
      ? anomalies.find((anomaly) => anomaly.id === modalState.anomalyId) ?? null
      : null;
  const activePopupIdentity =
    modalState?.type === "symbolDetail"
      ? modalState.identity.mode === selectedUiMode
        ? modalState.identity
        : replaceSymbolPopupMode(modalState.identity, selectedUiMode)
      : null;

  useEffect(() => {
    const modeChanged = previousUiModeRef.current !== selectedUiMode;
    previousUiModeRef.current = selectedUiMode;

    setModalState((currentState) => {
      if (
        currentState?.type !== "symbolDetail" &&
        currentState?.type !== "symbolAnomalyDetail"
      ) {
        return currentState;
      }

      const currentIdentity = currentState.type === "symbolDetail"
        ? currentState.identity
        : currentState.parentIdentity;
      let nextIdentity = currentIdentity.mode === selectedUiMode
        ? currentIdentity
        : replaceSymbolPopupMode(currentIdentity, selectedUiMode);

      if (!modeChanged && selectedSymbol && nextIdentity.symbol !== selectedSymbol) {
        nextIdentity = replaceSymbolPopupSymbol(nextIdentity, selectedSymbol) ?? nextIdentity;
      }

      if (nextIdentity === currentIdentity) {
        return currentState;
      }

      return { type: "symbolDetail", identity: nextIdentity };
    });
  }, [selectedSymbol, selectedUiMode]);

  useEffect(() => {
    setModalState((currentState) => {
      if (
        currentState?.type !== "anomalyDetail" ||
        anomalies.some((anomaly) => anomaly.id === currentState.anomalyId)
      ) {
        return currentState;
      }

      return currentState.returnContext === "anomalies"
        ? { type: "anomalies" }
        : null;
    });
  }, [anomalies]);

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

  function openAnomalyDetail(
    anomalyId: string,
    returnContext: "anomalies" | "dashboard",
  ) {
    if (!anomalies.some((anomaly) => anomaly.id === anomalyId)) {
      return;
    }

    setModalState({ type: "anomalyDetail", anomalyId, returnContext });
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
          onOpenAnomalyDetail={(anomalyId) =>
            openAnomalyDetail(anomalyId, "dashboard")
          }
          summary={summary}
          isLoading={isLoading}
        />
      </section>
      {modalState?.type === "symbols" ? (
        <AllSymbolHealthModal
          initialFocusSymbol={modalState.focusSymbol}
          symbols={symbols}
          onClose={() => setModalState(null)}
          onOpenSymbolDetail={(symbol) => openSymbolDetail(symbol, "symbols")}
        />
      ) : null}
      {modalState?.type === "anomalies" ? (
        <AllAnomaliesModal
          anomalies={anomalies}
          initialFocusAnomalyId={modalState.focusAnomalyId}
          onClose={() => setModalState(null)}
          onOpenAnomalyDetail={(anomalyId) =>
            openAnomalyDetail(anomalyId, "anomalies")
          }
        />
      ) : null}
      {modalState?.type === "anomalyDetail" && activeAnomaly ? (
        <AnomalyDetailModal
          anomaly={activeAnomaly}
          onBack={
            modalState.returnContext === "anomalies"
              ? () =>
                  setModalState({
                    type: "anomalies",
                    focusAnomalyId: activeAnomaly.id,
                  })
              : undefined
          }
          onClose={() => setModalState(null)}
        />
      ) : null}
      {modalState?.type === "symbolAnomalyDetail" &&
      modalState.parentIdentity.mode === selectedUiMode &&
      (!selectedSymbol || modalState.parentIdentity.symbol === selectedSymbol) ? (
        <SymbolOwnedAnomalyDetailModal
          key={`${symbolPopupIdentityKey(modalState.parentIdentity)}:${modalState.anomalyId}`}
          anomalyId={modalState.anomalyId}
          parentIdentity={modalState.parentIdentity}
          summary={summary}
          onBack={() =>
            setModalState({
              type: "symbolDetail",
              identity: modalState.parentIdentity,
              focusAnomalyId: modalState.anomalyId,
            })
          }
          onClose={() => setModalState(null)}
          onMissing={() =>
            setModalState({
              type: "symbolDetail",
              identity: modalState.parentIdentity,
            })
          }
        />
      ) : null}
      {activePopupIdentity ? (
        <SymbolDetailModal
          key={symbolPopupIdentityKey(activePopupIdentity)}
          identity={activePopupIdentity}
          initialFocusAnomalyId={
            modalState?.type === "symbolDetail"
              ? modalState.focusAnomalyId
              : undefined
          }
          summary={summary}
          onBack={
            activePopupIdentity.returnContext === "symbols"
              ? () =>
                  setModalState({
                    type: "symbols",
                    focusSymbol: activePopupIdentity.symbol,
                  })
              : undefined
          }
          onClose={() => setModalState(null)}
          onOpenAnomalyDetail={(anomalyId) =>
            setModalState({
              type: "symbolAnomalyDetail",
              anomalyId,
              parentIdentity: activePopupIdentity,
            })
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
          symbols.length > 0 ? (
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
  const statusText = marketStatusLabel(symbol.availability, symbol.health?.status);

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
  onOpenAnomalyDetail,
  summary,
  isLoading,
}: {
  onOpenAll: () => void;
  onOpenAnomalyDetail: (anomalyId: string) => void;
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
          anomalies.length > 0 ? (
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
            onOpenAnomalyDetail={onOpenAnomalyDetail}
          />
          <RecentAnomaliesMobileCards
            rows={preview.rows}
            onOpenAnomalyDetail={onOpenAnomalyDetail}
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
  initialFocusAnomalyId,
  onClose,
  onOpenAnomalyDetail,
}: {
  anomalies: DashboardAnomaly[];
  initialFocusAnomalyId?: string;
  onClose: () => void;
  onOpenAnomalyDetail: (anomalyId: string) => void;
}) {
  return (
    <DashboardTableModal
      title="All anomalies"
      subtitle="Full available anomaly list from the current dashboard summary."
      dialogId="all-anomalies-title"
      initialFocusSelector={
        initialFocusAnomalyId
          ? `[data-anomaly-id="${initialFocusAnomalyId}"]`
          : undefined
      }
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
                    onOpenAnomalyDetail={onOpenAnomalyDetail}
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
                onOpenAnomalyDetail={onOpenAnomalyDetail}
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
  onOpenAnomalyDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenAnomalyDetail: (anomalyId: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  function handleOpenAnomaly() {
    onOpenAnomalyDetail(anomaly.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenAnomaly();
    }
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Open ${anomaly.symbol} ${formatAnomalyType(anomaly.anomaly_type)} anomaly detail ${anomaly.id}`}
      data-anomaly-id={anomaly.id}
      onClick={handleOpenAnomaly}
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
  onOpenAnomalyDetail,
}: {
  anomaly: DashboardAnomaly;
  onOpenAnomalyDetail: (anomalyId: string) => void;
}) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <button
      type="button"
      onClick={() => onOpenAnomalyDetail(anomaly.id)}
      data-anomaly-id={anomaly.id}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${anomaly.symbol} ${formatAnomalyType(anomaly.anomaly_type)} anomaly detail ${anomaly.id}`}
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

function AnomalyDetailModal({
  anomaly,
  backLabel = "Back to all anomalies",
  onBack,
  onClose,
}: {
  anomaly: DashboardAnomaly;
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <DashboardTableModal
      title="Anomaly Detail"
      subtitle={`${anomaly.symbol} · ${formatAnomalyType(anomaly.anomaly_type)}`}
      dialogId="anomaly-detail-title"
      onClose={onClose}
      secondaryAction={
        onBack ? (
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
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnomalyDetailField label="Symbol" value={anomaly.symbol} />
        <AnomalyDetailField
          label="Anomaly type"
          value={formatAnomalyType(anomaly.anomaly_type)}
        />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Severity
          </dt>
          <dd className="mt-2">
            <SeverityBadge severity={anomaly.severity} />
          </dd>
        </div>
        <AnomalyDetailField
          label="Observed value"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.observed_value,
            "observed",
          )}
        />
        <AnomalyDetailField
          label="Threshold value"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.threshold_value,
            "threshold",
          )}
        />
        <AnomalyDetailField
          label="Event time"
          value={formatAnomalyTime(anomaly.event_time)}
        />
        <AnomalyDetailField
          label="Created time"
          value={formatAnomalyTime(anomaly.created_at)}
        />
        <AnomalyDetailField label="UUID" value={anomaly.id} />
        <AnomalyDetailField
          label="Message"
          value={anomaly.message || "—"}
          className="sm:col-span-2 xl:col-span-3"
        />
      </dl>
    </DashboardTableModal>
  );
}

function AnomalyDetailField({
  className = "",
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3 ${className}`}
    >
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function AllSymbolHealthModal({
  initialFocusSymbol,
  onOpenSymbolDetail,
  symbols,
  onClose,
}: {
  initialFocusSymbol?: string;
  onOpenSymbolDetail: (symbol: string) => void;
  symbols: DashboardSymbolSummary[];
  onClose: () => void;
}) {
  return (
    <DashboardTableModal
      title="All markets"
      subtitle="Full available market list from the current dashboard summary."
      dialogId="all-symbol-health-title"
      initialFocusSelector={
        initialFocusSymbol
          ? `[aria-label="Open ${initialFocusSymbol} market detail"]`
          : undefined
      }
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
  const statusText = marketStatusLabel(symbol.availability, symbol.health?.status);

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

function SymbolOwnedAnomalyDetailModal({
  anomalyId,
  parentIdentity,
  summary,
  onBack,
  onClose,
  onMissing,
}: {
  anomalyId: string;
  parentIdentity: SymbolPopupIdentity;
  summary: DashboardSummary | null;
  onBack: () => void;
  onClose: () => void;
  onMissing: () => void;
}) {
  const resourceState = useSymbolPopupResource(
    parentIdentity,
    summary?.symbols.find((entry) => entry.symbol === parentIdentity.symbol),
  );
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;

  if (
    resourceState.status === "success" &&
    (resourceState.resource.mode !== parentIdentity.mode ||
      resourceState.resource.symbol !== parentIdentity.symbol)
  ) {
    throw new TypeError(
      `popup resource identity mismatch: expected ${parentIdentity.mode}/${parentIdentity.symbol}`,
    );
  }

  const anomaly = resourceState.status === "success"
    ? resourceState.resource.anomalies.find((entry) => entry.id === anomalyId) ?? null
    : null;

  useEffect(() => {
    if (resourceState.status === "success" && !anomaly) {
      onMissingRef.current();
    }
  }, [anomaly, resourceState.status]);

  if (anomaly) {
    return (
      <AnomalyDetailModal
        anomaly={anomaly}
        onBack={onBack}
        onClose={onClose}
        backLabel="Back to symbol detail"
      />
    );
  }

  if (resourceState.status === "success") {
    return null;
  }

  return (
    <DashboardTableModal
      title="Anomaly Detail"
      subtitle={`${parentIdentity.symbol} · ${parentIdentity.mode === "demo" ? "Demo" : "Live"}`}
      dialogId="anomaly-detail-title"
      onClose={onClose}
    >
      {resourceState.status === "loading" ? (
        <LoadingSkeleton className="h-64" />
      ) : resourceState.status === "error" ? (
        <ErrorPanel
          title={`${parentIdentity.symbol} anomaly detail unavailable`}
          message={buildErrorMessage(resourceState.error)}
          onRetry={() => void resourceState.refetch()}
        />
      ) : (
        <EmptyBlock
          message={`${parentIdentity.symbol} is unavailable in ${parentIdentity.mode === "demo" ? "Demo" : "Live"} mode.`}
        />
      )}
    </DashboardTableModal>
  );
}

function SymbolDetailModal({
  identity,
  initialFocusAnomalyId,
  summary,
  onBack,
  onClose,
  onOpenAnomalyDetail,
}: {
  identity: SymbolPopupIdentity;
  initialFocusAnomalyId?: string;
  summary: DashboardSummary | null;
  onBack?: () => void;
  onClose: () => void;
  onOpenAnomalyDetail: (anomalyId: string) => void;
}) {
  const resourceState = useSymbolPopupResource(
    identity,
    summary?.symbols.find((entry) => entry.symbol === identity.symbol),
  );
  const backLabel =
    identity.returnContext === "symbols"
      ? "Back to all markets"
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
      initialFocusSelector={
        initialFocusAnomalyId
          ? `[data-anomaly-id="${initialFocusAnomalyId}"]`
          : undefined
      }
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
            onOpenAnomalyDetail={onOpenAnomalyDetail}
          />
        )}
      </div>
    </DashboardTableModal>
  );
}

function SymbolPopupSuccess({
  onOpenAnomalyDetail,
  viewModel,
}: {
  onOpenAnomalyDetail: (anomalyId: string) => void;
  viewModel: MarketDetailViewModel;
}) {
  const observed = viewModel.availability === "observed";

  return (
    <div className="space-y-6" data-testid="symbol-popup-success">
      <SymbolDetailHeader
        symbol={viewModel.identity.symbol}
        statusTone={viewModel.status.tone}
        statusText={viewModel.status.text}
        sourceLabel={viewModel.source === "live" ? "Live" : "Demo"}
      />
      <SymbolDetailMetrics viewModel={viewModel} />
      {observed ? (
        <SymbolDetailAnomalies
          symbol={viewModel.identity.symbol}
          anomalies={viewModel.anomalies}
          onOpenAnomalyDetail={onOpenAnomalyDetail}
        />
      ) : null}
    </div>
  );
}

function DashboardTableModal({
  children,
  dialogId,
  initialFocusSelector,
  onClose,
  secondaryAction,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  dialogId: string;
  initialFocusSelector?: string;
  onClose: () => void;
  secondaryAction?: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusableSelector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    const requestedInitialFocus = initialFocusSelector && dialogRef.current
      ? findVisibleInitialFocus(dialogRef.current, initialFocusSelector)
      : null;
    (requestedInitialFocus ?? closeButtonRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [initialFocusSelector]);

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
    >
      <section
        ref={dialogRef}
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
              ref={closeButtonRef}
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

function findVisibleInitialFocus(
  container: HTMLElement,
  selector: string,
): HTMLElement | null {
  const matches = Array.from(
    container.querySelectorAll<HTMLElement>(selector),
  );
  const visibleMatch = matches.find(
    (element) => element.getClientRects().length > 0,
  );

  if (visibleMatch) {
    return visibleMatch;
  }

  // jsdom has no layout engine, so every element has zero client rects. Keep a
  // deterministic DOM-order fallback there without weakening browser visibility.
  return container.getClientRects().length === 0 ? matches[0] ?? null : null;
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

function buildErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.message} (${error.status})`;
  }

  if (isApiValidationError(error)) {
    return error.message;
  }

  return "The dashboard summary request did not complete successfully.";
}
