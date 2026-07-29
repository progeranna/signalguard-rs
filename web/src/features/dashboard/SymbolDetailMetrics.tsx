import type { MarketDetailViewModel } from "./marketViewModel";
import type { StatusTone } from "@/shared/lib/status";

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
  return (
    <div className="grid gap-y-4 divide-y divide-white/10 md:grid-cols-5 md:divide-x md:divide-y-0">
      <MetricStripItem
        label="Health"
        value={viewModel.healthScore}
        valueClassName={toneTextClass(viewModel.status.tone)}
      />
      <MetricStripItem label="Last price" value={viewModel.metrics.lastPrice} />
      <MetricStripItem label="Spread" value={viewModel.metrics.spread} />
      <MetricStripItem label="Trades/min" value={viewModel.metrics.tradesPerMinute} />
      <MetricStripItem label="Freshness" value={viewModel.metrics.freshness} />
    </div>
  );
}

function RouteStatePanels({ viewModel }: { viewModel: MarketDetailViewModel }) {
  const observed = viewModel.availability === "observed";

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
            <InlineDataRow
              label="Market status"
              value={viewModel.status.text}
              valueClassName={toneTextClass(viewModel.status.tone)}
            />
            <InlineDataRow
              label="Recent anomalies"
              value={formatRouteAnomalyCount(viewModel.anomalies.length)}
            />
            <InlineDataRow label="Price move (1m)" value={viewModel.metrics.priceMove} />
            <InlineDataRow label="Depth sequence gaps" value={viewModel.metrics.depthGaps} />
          </dl>
        ) : (
          <RouteEmptyState message={availabilityMessage(viewModel.availability)} />
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
              <InlineDataRow label="Last trade price" value={viewModel.metrics.lastPrice} />
              <InlineDataRow label="Best bid" value={viewModel.metrics.bestBid} />
              <InlineDataRow label="Best ask" value={viewModel.metrics.bestAsk} />
              <InlineDataRow label="Spread" value={viewModel.metrics.spread} />
              <InlineDataRow label="Trades/min" value={viewModel.metrics.tradesPerMinute} />
              <InlineDataRow label="Last event" value={viewModel.metrics.lastEvent} />
              <InlineDataRow label="Freshness" value={viewModel.metrics.freshness} />
              <InlineDataRow label="Depth gap count" value={viewModel.metrics.depthGaps} />
            </dl>
          ) : (
            <RouteEmptyState message={availabilityMessage(viewModel.availability)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PopupMetricGrid({ viewModel }: { viewModel: MarketDetailViewModel }) {
  return viewModel.availability === "observed" ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <PopupMetric label="Health" value={viewModel.healthScore} />
      <PopupMetric label="Price" value={viewModel.metrics.lastPrice} />
      <PopupMetric label="Spread" value={viewModel.metrics.spread} />
      <PopupMetric label="Trades/min" value={viewModel.metrics.tradesPerMinute} />
      <PopupMetric label="Freshness" value={viewModel.metrics.freshness} />
      <PopupMetric label="Anomalies" value={viewModel.metrics.anomalyCount} />
      <PopupMetric label="Best bid" value={viewModel.metrics.bestBid} />
      <PopupMetric label="Best ask" value={viewModel.metrics.bestAsk} />
    </div>
  ) : (
    <PopupEmptyState message={availabilityMessage(viewModel.availability)} />
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
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tracking-tight ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function PopupMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
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

function availabilityMessage(
  availability: MarketDetailViewModel["availability"],
): string {
  switch (availability) {
    case "configured":
      return "Configured for Live; Live ingestion is not active.";
    case "awaiting":
      return "Awaiting first Live market data.";
    case "unavailable":
      return "Live market data is unavailable.";
    default:
      return "No current market state available for this market.";
  }
}

function formatRouteAnomalyCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
