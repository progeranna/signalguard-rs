import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useCatalogDashboardSummaryQuery } from "@/features/dashboard/api";
import { adaptMarketResourceToViewModel } from "@/features/dashboard/marketAdapters";
import type { MarketAnomalyViewModel, MarketDetailViewModel } from "@/features/dashboard/marketViewModel";
import { storeSelectedSymbol } from "@/features/dashboard/selectedSymbol";
import { parseSymbolId } from "@/features/dashboard/symbolId";
import { useSymbolMarketResource } from "@/features/dashboard/symbolMarketResource";
import { useResolvedUiMode } from "@/features/dashboard/uiMode";
import type { DashboardSymbolSummary, UiMode } from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { StatusBadge } from "@/shared/components/StatusBadge";
import type { StatusTone } from "@/shared/lib/status";

export function SymbolDetailPage() {
  const selectedUiMode = useResolvedUiMode();
  const catalogQuery = useCatalogDashboardSummaryQuery(selectedUiMode);
  const availableSymbols = catalogQuery.data?.symbols ?? [];
  const routeSymbol = useParams().symbol ?? "";
  const selectedSymbol = normalizeSymbol(routeSymbol);
  const canonicalRouteSymbol = parseSymbolId(routeSymbol);
  const resourceState = useSymbolMarketResource({
    mode: selectedUiMode,
    symbol: canonicalRouteSymbol,
    summary: availableSymbols.find((entry) => entry.symbol === canonicalRouteSymbol),
  });
  const marketViewModel =
    resourceState.status === "success"
      ? adaptMarketResourceToViewModel(resourceState.resource, {
          mode: selectedUiMode,
          symbol: canonicalRouteSymbol ?? resourceState.resource.symbol,
        })
      : null;
  const isKnownSymbol = marketViewModel !== null;
  const resolvedSymbol =
    marketViewModel?.identity.symbol ?? null;
  const isLoading =
    resourceState.status === "loading" ||
    (resourceState.status === "unavailable" && catalogQuery.isLoading);
  const statusTone = marketViewModel?.status.tone ?? "neutral";
  const symbolStatusText = marketViewModel?.status.text ?? "Unknown";

  useEffect(() => {
    if (resolvedSymbol) {
      storeSelectedSymbol(selectedUiMode, resolvedSymbol);
    }
  }, [resolvedSymbol, selectedUiMode]);

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
            <StatusBadge
              status="neutral"
              text={marketViewModel?.source === "live" ? "Live" : "Demo"}
            />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Market-level market-data quality, freshness, and anomaly context.
          </p>
        </div>

        {isLoading || isKnownSymbol ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            {isLoading ? (
              <LoadingSkeleton className="h-20" />
            ) : (
              <MetricStrip
                viewModel={marketViewModel}
                statusTone={statusTone}
              />
            )}
          </div>
        ) : null}
      </section>

      {resourceState.status === "error" ? (
        <ErrorPanel
          title="Market detail unavailable"
          message="Retry the selected market resources."
          onRetry={() => void resourceState.refetch()}
        />
      ) : null}

      {!isLoading && resourceState.status === "unavailable" ? (
        <SymbolNotFoundState
          selectedSymbol={selectedSymbol}
          availableSymbols={availableSymbols}
          selectedUiMode={selectedUiMode}
        />
      ) : null}

      {isLoading || isKnownSymbol ? (
        <>
          <section className="sg-panel px-5 py-5">
            {isLoading ? (
              <LoadingSkeleton className="h-64" />
            ) : (
              <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
                <div>
                  <PanelHeader
                    eyebrow="Signal Preview"
                    title={`${selectedSymbol} signal snapshot`}
                    description="Selected-market resource snapshot."
                  />
                  {marketViewModel ? (
                    <dl className="mt-5 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                      <InlineDataRow
                        label="Market status"
                        value={symbolStatusText}
                        valueClassName={toneTextClass(statusTone)}
                      />
                      <InlineDataRow
                        label="Recent anomalies"
                        value={formatCount(marketViewModel.anomalies.length)}
                      />
                      <InlineDataRow
                        label="Price move (1m)"
                        value={marketViewModel.metrics.priceMove}
                      />
                      <InlineDataRow
                        label="Depth sequence gaps"
                        value={marketViewModel.metrics.depthGaps}
                      />
                    </dl>
                  ) : (
                    <FlatEmptyState message="Market snapshot is unavailable for this market." />
                  )}
                </div>

                <div>
                  <PanelHeader
                    eyebrow="Current Market State"
                    title="Latest normalized state"
                    description="Read-only fields from the selected market resource."
                  />
                  {marketViewModel && marketViewModel.stateAvailable ? (
                    <dl className="mt-5 grid gap-x-8 border-y border-white/[0.08] md:grid-cols-2">
                      <InlineDataRow
                        label="Last trade price"
                        value={marketViewModel.metrics.lastPrice}
                      />
                      <InlineDataRow
                        label="Best bid"
                        value={marketViewModel.metrics.bestBid}
                      />
                      <InlineDataRow
                        label="Best ask"
                        value={marketViewModel.metrics.bestAsk}
                      />
                      <InlineDataRow
                        label="Spread"
                        value={marketViewModel.metrics.spread}
                      />
                      <InlineDataRow
                        label="Trades/min"
                        value={marketViewModel.metrics.tradesPerMinute}
                      />
                      <InlineDataRow
                        label="Last event"
                        value={marketViewModel.metrics.lastEvent}
                      />
                      <InlineDataRow
                        label="Freshness"
                        value={marketViewModel.metrics.freshness}
                      />
                      <InlineDataRow
                        label="Depth gap count"
                        value={marketViewModel.metrics.depthGaps}
                      />
                    </dl>
                  ) : (
              <FlatEmptyState message={availabilityMessage(marketViewModel?.availability)} />
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
            {isLoading ? (
              <LoadingSkeleton className="h-52" />
            ) : marketViewModel && marketViewModel.anomalies.length > 0 ? (
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
                      {marketViewModel.anomalies.map((anomaly) => (
                        <AnomalyTableRow key={anomaly.id} anomaly={anomaly} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
                  {marketViewModel.anomalies.map((anomaly) => (
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
  selectedUiMode,
}: {
  selectedSymbol: string;
  availableSymbols: DashboardSymbolSummary[];
  selectedUiMode: UiMode;
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
              onClick={() => storeSelectedSymbol(selectedUiMode, entry.symbol)}
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

function availabilityMessage(availability: DashboardSymbolSummary["availability"] | undefined): string {
  switch (availability) {
    case "configured": return "Configured for Live; Live ingestion is not active.";
    case "awaiting": return "Awaiting first Live market data.";
    case "unavailable": return "Live market data is unavailable.";
    default: return "No current market state available for this market.";
  }
}

function MetricStrip({
  viewModel,
  statusTone,
}: {
  viewModel: MarketDetailViewModel | null;
  statusTone: StatusTone;
}) {
  if (!viewModel) return null;
  return (
    <div className="grid gap-y-4 divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
      <MetricStripItem
        label="Health"
        value={viewModel.healthScore}
        valueClassName={toneTextClass(statusTone)}
      />
      <MetricStripItem label="Last price" value={viewModel.metrics.lastPrice} />
      <MetricStripItem label="Spread" value={viewModel.metrics.spread} />
      <MetricStripItem label="Trades/min" value={viewModel.metrics.tradesPerMinute} />
      <MetricStripItem label="Freshness" value={viewModel.metrics.freshness} />
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

function AnomalyTableRow({ anomaly }: { anomaly: MarketAnomalyViewModel }) {
  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-100">
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        <StatusBadge
          status={anomaly.severity.tone}
          text={anomaly.severity.text}
        />
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.observed.route}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.threshold.route}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.detectedAt}
      </td>
      <td className="px-2 py-3 text-sm text-slate-400">
        {anomaly.context}
      </td>
    </tr>
  );
}

function AnomalyMobileRow({ anomaly }: { anomaly: MarketAnomalyViewModel }) {
  return (
    <article className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {anomaly.type}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
            {anomaly.detectedAt}
          </p>
        </div>
        <StatusBadge
          status={anomaly.severity.tone}
          text={anomaly.severity.text}
        />
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <InlineMobileValue label="Observed" value={anomaly.observed.route} />
        <InlineMobileValue label="Threshold" value={anomaly.threshold.route} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.context}</p>
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

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
