import { AppShell } from "@/app/AppShell";
import { AppProviders } from "@/app/providers";
import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

export function App() {
  return (
    <AppProviders>
      <AppShell>
        <section className="space-y-8">
          <PageHeader
            eyebrow="Web Console"
            title="SignalGuard observability surface"
            description="The frontend skeleton is online with the shared layout, styling system, and UI primitives that future data views will reuse."
            actions={<StatusBadge status="info" text="Scaffold" />}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Frontend stack"
              value="Vite + React"
              description="TypeScript-first application foundation under web/."
              tone="info"
            />
            <MetricCard
              label="Visual baseline"
              value="Dark console"
              description="Graphite surfaces, cyan accents, and status-aware highlights."
              tone="healthy"
            />
            <MetricCard
              label="Next slice"
              value="Routing"
              description="Route placeholders and API integration follow in the next commits."
              tone="warning"
            />
          </div>
        </section>
      </AppShell>
    </AppProviders>
  );
}
