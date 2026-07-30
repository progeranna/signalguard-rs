import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useCatalogDashboardSummaryQuery } from "@/features/dashboard/api";
import { adaptMarketResourceToViewModel } from "@/features/dashboard/marketAdapters";
import { storeSelectedSymbol } from "@/features/dashboard/selectedSymbol";
import { parseSymbolId, type SymbolId } from "@/features/dashboard/symbolId";
import { useSymbolMarketResource } from "@/features/dashboard/symbolMarketResource";
import { SymbolDetailAnomalies } from "@/features/dashboard/SymbolDetailAnomalies";
import { SymbolDetailHeader } from "@/features/dashboard/SymbolDetailHeader";
import { SymbolDetailMetrics } from "@/features/dashboard/SymbolDetailMetrics";
import { useResolvedUiMode } from "@/features/dashboard/uiMode";
import type { DashboardSymbolSummary, UiMode } from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";

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
  const source = marketViewModel?.source ?? catalogQuery.data?.source;
  const observed = marketViewModel?.availability === "observed";

  useEffect(() => {
    if (resolvedSymbol) {
      storeSelectedSymbol(selectedUiMode, resolvedSymbol);
    }
  }, [resolvedSymbol, selectedUiMode]);

  return (
    <section className="space-y-4">
      <section className="sg-panel overflow-visible px-5 py-5 sm:px-6">
        <SymbolDetailHeader
          variant="route"
          symbol={selectedSymbol}
          statusTone={statusTone}
          statusText={symbolStatusText}
          sourceLabel={source === "live" ? "Live" : source === "demo" ? "Demo" : "Unavailable"}
        />

        {isLoading || isKnownSymbol ? (
          <div className="mt-5 border-t border-white/10 pt-4">
            {isLoading ? (
              <LoadingSkeleton className="h-20" />
            ) : observed && marketViewModel ? (
              <SymbolDetailMetrics surface="route-strip" viewModel={marketViewModel} />
            ) : (
              <FlatEmptyState message={availabilityMessage(marketViewModel?.availability)} />
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
            ) : marketViewModel ? (
              <SymbolDetailMetrics surface="route-state" viewModel={marketViewModel} />
            ) : null}
          </section>

          {observed && marketViewModel ? (
            <SymbolDetailAnomalies
              variant="route"
              symbol={selectedSymbol}
              anomalies={marketViewModel.anomalies}
            />
          ) : null}
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

function FlatEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 border-y border-white/[0.08] py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function normalizeSymbol(value: string | undefined): SymbolId {
  return (value?.trim().toUpperCase() || "UNKNOWN") as SymbolId;
}
