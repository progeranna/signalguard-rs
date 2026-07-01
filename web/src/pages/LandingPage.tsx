import { Link } from "react-router-dom";

import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

const landingLinks = [
  {
    title: "Dashboard",
    to: "/dashboard",
    description: "Future cross-symbol operational view backed by GET /dashboard/summary.",
  },
  {
    title: "Anomalies",
    to: "/anomalies",
    description: "Read-only explorer for detector output, severities, and symbol drill-down.",
  },
  {
    title: "Architecture",
    to: "/architecture",
    description: "System map for replay ingestion, bounded processing, storage, and API layers.",
  },
];

export function LandingPage() {
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Landing"
        title="Explainable market-data monitoring in the browser"
        description="SignalGuard RS monitors public crypto market-data quality. This console stays intentionally narrow: operational visibility, anomaly context, and architecture guidance without any trading or account workflows."
        actions={<StatusBadge status="ok" text="Public demo scope" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="sg-panel space-y-6 px-6 py-6">
          <div className="space-y-3">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-200/80">
              What the console is for
            </p>
            <h3 className="text-2xl font-semibold tracking-tight text-white">
              A read-only surface for health, freshness, and anomaly signals
            </h3>
            <p className="max-w-3xl text-sm leading-6 text-slate-300">
              Replay fixtures and live Binance public streams feed the same
              bounded pipeline. The console will expose the latest service
              condition, per-symbol state snapshots, and explainable anomaly
              output on top of the existing Axum API.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Primary endpoint"
              value="/dashboard/summary"
              description="Compact bootstrap response for the first dashboard view."
              tone="info"
            />
            <MetricCard
              label="Console boundary"
              value="Read only"
              description="No order flow, no private exchange APIs, and no write controls."
              tone="healthy"
            />
            <MetricCard
              label="Data focus"
              value="Quality signals"
              description="Freshness, spreads, trade cadence, health scoring, and recent anomalies."
              tone="neutral"
            />
          </div>
        </div>

        <div className="sg-panel px-6 py-6">
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
              Console map
            </p>
            <div className="space-y-3">
              {landingLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="block rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
                >
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
