import { Link } from "react-router-dom";

import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

export function AnomaliesPage() {
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Anomalies"
        title="Recent detector output across symbols"
        description="The future anomaly explorer will keep the interaction lightweight: query controls, readable severities, symbol links, and direct alignment with the existing read-only backend endpoint."
        actions={<StatusBadge status="warning" text="Placeholder page" />}
      />

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <MetricCard
            label="Primary endpoint"
            value="/anomalies"
            description="Supports optional symbol filtering and limit controls."
            tone="critical"
          />
          <MetricCard
            label="Supported severities"
            value="info / warning / critical"
            description="Detector output stays explainable and easy to scan."
            tone="info"
          />
        </div>

        <div className="sg-panel px-6 py-6">
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
              Planned explorer behavior
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                "Filter by symbol and limit without inventing frontend-only fields.",
                "Show anomaly type, severity, event time, observed value, and threshold.",
                "Link back to symbol detail pages for context.",
                "Keep the first version static-first before table enhancements.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300"
                >
                  {item}
                </div>
              ))}
            </div>
            <Link
              to="/symbols/BTCUSDT"
              className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
            >
              View sample symbol route
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
