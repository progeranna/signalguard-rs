import type { MarketDetailViewModel } from "./marketViewModel";
import type { StatusTone } from "@/shared/lib/status";

const METRIC_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500";
const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  ok: "text-cyan-100",
  healthy: "text-emerald-200",
  degraded: "text-amber-200",
  unhealthy: "text-orange-200",
  info: "text-cyan-100",
  warning: "text-amber-200",
  critical: "text-orange-200",
  neutral: "text-white",
};
const AVAILABILITY_MESSAGE: Record<MarketDetailViewModel["availability"], string> = {
  observed: "No current market state available for this market.",
  configured: "Configured for Live; Live ingestion is not active.",
  awaiting: "Awaiting first Live market data.",
  unavailable: "Live market data is unavailable.",
};

export type SymbolDetailMetricsSurface = "route-strip" | "route-state" | "popup";

export type SymbolDetailMetricsProps = Readonly<{
  surface: SymbolDetailMetricsSurface;
  viewModel: MarketDetailViewModel;
}>;

export function SymbolDetailMetrics({
  surface,
  viewModel,
}: SymbolDetailMetricsProps) {
  switch (surface) {
    case "route-strip":
      return <RouteMetricStrip viewModel={viewModel} />;
    case "route-state":
      return <RouteStatePanels viewModel={viewModel} />;
    case "popup":
      return <PopupMetricGrid viewModel={viewModel} />;
  }
}

function RouteMetricStrip({ viewModel }: { viewModel: MarketDetailViewModel }) {
  const { metrics: marketMetrics } = viewModel;
  const metrics = [
    ["Health", viewModel.healthScore, TONE_TEXT_CLASS[viewModel.status.tone]],
    ["Last price", marketMetrics.lastPrice, undefined],
    ["Spread", marketMetrics.spread, undefined],
    ["Trades/min", marketMetrics.tradesPerMinute, undefined],
    ["Freshness", marketMetrics.freshness, undefined],
  ] as const;

  return (
    <div className="grid gap-y-4 divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
      {metrics.map(([label, value, valueClassName]) => (
        <MetricStripItem
          key={label}
          label={label}
          value={value}
          valueClassName={valueClassName}
        />
      ))}
    </div>
  );
}

function RouteStatePanels({ viewModel }: { viewModel: MarketDetailViewModel }) {
  const observed = viewModel.availability === "observed";
  const { metrics: marketMetrics } = viewModel;
  const signalMetrics = [
    ["Market status", viewModel.status.text, TONE_TEXT_CLASS[viewModel.status.tone]],
    ["Recent anomalies", new Intl.NumberFormat("en-US").format(viewModel.anomalies.length), undefined],
    ["Price move (1m)", marketMetrics.priceMove, undefined],
    ["Depth sequence gaps", marketMetrics.depthGaps, undefined],
  ] as const;
  const stateMetrics = [
    ["Last trade price", marketMetrics.lastPrice],
    ["Best bid", marketMetrics.bestBid],
    ["Best ask", marketMetrics.bestAsk],
    ["Spread", marketMetrics.spread],
    ["Trades/min", marketMetrics.tradesPerMinute],
    ["Last event", marketMetrics.lastEvent],
    ["Freshness", marketMetrics.freshness],
    ["Depth gap count", marketMetrics.depthGaps],
  ] as const;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <div>
        <PanelHeader
          eyebrow="Signal Preview"
          title={`${viewModel.identity.symbol} signal snapshot`}
          description="Selected-market resource snapshot."
        />
        {observed ? (
          <dl className="mt-5 divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {signalMetrics.map(([label, value, valueClassName]) => (
              <InlineDataRow
                key={label}
                label={label}
                value={value}
                valueClassName={valueClassName}
              />
            ))}
          </dl>
        ) : (
          <RouteEmptyState message={AVAILABILITY_MESSAGE[viewModel.availability]} />
        )}
      </div>

      {observed ? (
        <div>
          <PanelHeader
            eyebrow="Current Market State"
            title="Latest normalized state"
            description="Read-only fields from the selected market resource."
          />
          {viewModel.stateAvailable ? (
            <dl className="mt-5 grid gap-x-8 border-y border-white/[0.08] md:grid-cols-2">
              {stateMetrics.map(([label, value]) => (
                <InlineDataRow key={label} label={label} value={value} />
              ))}
            </dl>
          ) : (
            <RouteEmptyState message={AVAILABILITY_MESSAGE[viewModel.availability]} />
          )}
        </div>
      ) : null}
    </div>
  );
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

function MetricStripItem({
  label,
  value,
  valueClassName = "text-white",
}: Readonly<{
  label: string;
  value: string;
  valueClassName?: string;
}>) {
  return (
    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:pl-0 md:last:pr-0">
      <p className={METRIC_LABEL_CLASS}>{label}</p>
      <p className={`mt-1 text-lg font-semibold tracking-tight ${valueClassName}`}>
        {value}
      </p>
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

function PanelHeader({
  eyebrow,
  title,
  description,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
}>) {
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
}: Readonly<{
  label: string;
  value: string;
  valueClassName?: string;
}>) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className={`text-right text-sm font-semibold ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function RouteEmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 border-y border-white/[0.08] py-5 text-sm leading-6 text-slate-400">
      {message}
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
