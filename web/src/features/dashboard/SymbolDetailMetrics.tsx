import type { MarketDetailViewModel } from "./marketViewModel";
const METRIC_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500";
const AVAILABILITY_MESSAGE: Record<MarketDetailViewModel["availability"], string> = {
  observed: "No current market state available for this market.",
  configured: "Configured for Live; Live ingestion is not active.",
  awaiting: "Awaiting first Live market data.",
  unavailable: "Live market data is unavailable.",
};

export type SymbolDetailMetricsProps = Readonly<{
  viewModel: MarketDetailViewModel;
}>;

export function SymbolDetailMetrics({ viewModel }: SymbolDetailMetricsProps) {
  return <PopupMetricGrid viewModel={viewModel} />;
}

function PopupMetricGrid({ viewModel }: { viewModel: MarketDetailViewModel }) {
  if (viewModel.availability !== "observed") {
    return <PopupEmptyState message={AVAILABILITY_MESSAGE[viewModel.availability]} />;
  }

  const { metrics: marketMetrics } = viewModel;
  const metrics = [
    ["Health", viewModel.healthScore],
    ["Price", marketMetrics.lastPrice],
    ["Spread", marketMetrics.spread],
    ["Trades/min", marketMetrics.tradesPerMinute],
    ["Freshness", marketMetrics.freshness],
    ["Anomalies", marketMetrics.anomalyCount],
    ["Best bid", marketMetrics.bestBid],
    ["Best ask", marketMetrics.bestAsk],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value]) => (
        <PopupMetric key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function PopupMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className={METRIC_LABEL_CLASS}>{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

function PopupEmptyState({ message }: { message: string }) {
  return (
    <div className="border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}
