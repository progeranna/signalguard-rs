import { useParams } from "react-router-dom";

import { MetricCard } from "@/shared/components/MetricCard";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";

export function SymbolDetailPage() {
  const { symbol = "UNKNOWN" } = useParams();

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Symbol detail"
        title={`${symbol} detail view`}
        description="This page will combine latest market state, health evaluation, and recent symbol-scoped anomalies without changing the backend contract."
        actions={<StatusBadge status="info" text="Contract placeholder" />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="State endpoint"
          value={`/market/${symbol}/state`}
          description="Latest normalized state snapshot and freshness fields."
          tone="neutral"
        />
        <MetricCard
          label="Health endpoint"
          value={`/market/${symbol}/health`}
          description="Explainable score, status, penalties, and market health signals."
          tone="healthy"
        />
        <MetricCard
          label="Anomaly endpoint"
          value={`/anomalies?symbol=${symbol}&limit=50`}
          description="Recent detector output filtered to the selected symbol."
          tone="warning"
        />
      </div>
    </section>
  );
}
