import { Link } from "react-router-dom";

import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

const placeholderSections = [
  {
    label: "Service snapshot",
    value: "Pipeline + service status",
    description: "This page will bootstrap from the compact dashboard summary endpoint.",
  },
  {
    label: "Symbol coverage",
    value: "Tracked market set",
    description: "Latest per-symbol state and health summaries will render here.",
  },
  {
    label: "Recent anomalies",
    value: "Detector output",
    description: "The first iteration will preview the latest emitted anomaly events.",
  },
];

export function DashboardPage() {
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Cross-symbol operational visibility"
        description="This skeleton reserves the dashboard layout for the shared summary payload. The next slice wires the typed API client and query state into these sections."
        actions={<StatusBadge status="warning" text="Placeholder page" />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {placeholderSections.map((section) => (
          <MetricCard
            key={section.label}
            label={section.label}
            value={section.value}
            description={section.description}
            tone="neutral"
          />
        ))}
      </div>

      <div className="sg-panel flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
            Next drill-down
          </p>
          <h3 className="text-xl font-semibold text-white">
            Symbol pages and anomaly views stay separate from the summary layer
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            The dashboard will remain compact. Deeper symbol and anomaly reads
            continue to use the existing backend endpoints documented in
            `docs/web-console.md`.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/symbols/BTCUSDT"
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Open sample symbol
          </Link>
          <Link
            to="/anomalies"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
          >
            Review anomalies page
          </Link>
        </div>
      </div>
    </section>
  );
}
