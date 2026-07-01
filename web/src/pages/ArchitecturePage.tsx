import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

const architectureSteps = [
  "Replay fixtures and live Binance public streams feed one normalized ingestion path.",
  "A bounded Tokio pipeline carries events into market-state aggregation and anomaly detectors.",
  "Redis owns latest-state snapshots while PostgreSQL stores anomaly and market history.",
  "The web console stays read-only and consumes the existing Axum API surface.",
];

export function ArchitecturePage() {
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Architecture"
        title="How SignalGuard RS moves data through the system"
        description="This page explains the console’s place in the backend architecture without inventing a separate frontend-specific server tier."
        actions={<StatusBadge status="healthy" text="Read-only layer" />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Sources"
          value="Replay + Binance"
          description="Historical fixtures and live public streams converge on the same event model."
          tone="info"
        />
        <MetricCard
          label="Processing"
          value="Bounded pipeline"
          description="Backpressure stays explicit rather than silently dropping load."
          tone="healthy"
        />
        <MetricCard
          label="Presentation"
          value="Axum + web/"
          description="HTTP APIs remain the single read-only contract consumed by the browser."
          tone="neutral"
        />
      </div>

      <div className="sg-panel px-6 py-6">
        <div className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
            System flow
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {architectureSteps.map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
              >
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-200/80">
                  Step {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
