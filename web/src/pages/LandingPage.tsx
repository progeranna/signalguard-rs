import { Link } from "react-router-dom";

import { StatusBadge } from "@/shared/components/StatusBadge";

const heroBadges = [
  { status: "ok" as const, text: "Read-only demo" },
  { status: "info" as const, text: "Public market data" },
  { status: "healthy" as const, text: "Replay-ready" },
];

const signalTapeItems = [
  "GET /dashboard/summary",
  "pipeline health",
  "market health",
  "stale_data",
  "event_lag_spike",
  "Redis latest state",
  "PostgreSQL history",
  "/metrics",
];

const capabilityCards = [
  {
    title: "Replay and Binance public streams",
    description:
      "Replay fixtures and Binance public WebSocket events enter the same monitoring path.",
    tags: ["replay files", "trade", "bookTicker"],
    tone: "cyan",
  },
  {
    title: "Bounded Tokio pipeline",
    description:
      "Normalized events move through an explicit bounded channel with visible backpressure.",
    tags: ["Tokio", "backpressure", "normalized events"],
    tone: "green",
  },
  {
    title: "Explainable anomaly detectors",
    description:
      "Rule-based checks turn stream behavior into readable data-quality signals.",
    tags: ["spread_spike", "quote_stuck", "depth_sequence_gap"],
    tone: "amber",
  },
  {
    title: "Redis/PostgreSQL plus Axum API",
    description:
      "Redis keeps latest state, PostgreSQL keeps history, and Axum exposes read-only endpoints.",
    tags: ["Redis", "PostgreSQL", "Axum"],
    tone: "blue",
  },
];

const previewRows = [
  { label: "Service", value: "signalguard-rs", tone: "text-white" },
  { label: "Mode", value: "replay / public streams", tone: "text-cyan-100" },
  {
    label: "Pipeline",
    value: "healthy / degraded / unhealthy",
    tone: "text-emerald-100",
  },
  {
    label: "Ownership",
    value: "Redis latest state, PostgreSQL history",
    tone: "text-slate-100",
  },
];

const detectorLabels = [
  "stale_data",
  "spread_spike",
  "event_lag_spike",
  "trade_burst",
];

const endpointLabels = [
  "/health",
  "/pipeline/health",
  "/dashboard/summary",
  "/anomalies",
  "/metrics",
];

const processSteps = [
  {
    title: "Ingest",
    description: "Replay files and Binance public streams provide market events.",
  },
  {
    title: "Normalize",
    description: "Trade, quote, and depth payloads become shared event types.",
  },
  {
    title: "Detect",
    description: "Detectors evaluate freshness, spreads, cadence, and lag.",
  },
  {
    title: "Expose",
    description: "Axum endpoints and Prometheus-style metrics stay read-only.",
  },
];

const boundaryItems = [
  "No trading",
  "No account data",
  "No private exchange keys",
  "No order execution",
];

const landingLinks = [
  {
    title: "Dashboard",
    to: "/dashboard",
    action: "Open dashboard",
    description: "Cross-symbol summary from GET /dashboard/summary.",
  },
  {
    title: "Anomalies",
    to: "/anomalies",
    action: "Review anomalies",
    description: "Detector output, severity labels, and symbol drill-downs.",
  },
  {
    title: "Architecture",
    to: "/architecture",
    action: "View architecture",
    description: "Replay/live ingestion, bounded processing, storage, cache, and API layers.",
  },
];

export function LandingPage() {
  return (
    <section className="space-y-5">
      <div className="sg-panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-7 px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
            <div className="flex flex-wrap gap-2">
              {heroBadges.map((badge) => (
                <StatusBadge key={badge.text} status={badge.status} text={badge.text} />
              ))}
            </div>

            <div className="max-w-3xl space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-200/80">
                Public demo entry
              </p>
              <div className="space-y-2">
                <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  SignalGuard RS
                </h2>
                <p className="text-lg font-semibold leading-7 text-cyan-100 sm:text-2xl sm:leading-8">
                  crypto market-data quality monitoring
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                Public market events go in; explainable health and anomaly
                signals come out. The console frames replay/live ingestion,
                market state, detector output, and read-only API boundaries.
              </p>
            </div>

            <div className="grid gap-3 sm:flex sm:flex-wrap">
              {landingLinks.map((item, index) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    "inline-flex items-center justify-between gap-2 rounded-full border px-4 py-2 text-sm font-medium transition sm:justify-start",
                    index === 0
                      ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/20"
                      : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]",
                  ].join(" ")}
                >
                  {item.action}
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              ))}
            </div>
          </div>

          <ConsolePreview />
        </div>

        <SignalTape />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {capabilityCards.map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 shadow-[0_18px_44px_rgba(2,6,23,0.24)] sm:px-5 sm:py-5"
          >
            <div className="space-y-3.5">
              <div
                className={`h-1.5 w-16 rounded-full ${capabilityToneClass(card.tone)}`}
              />
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-white">{card.title}</h3>
                <p className="text-sm leading-6 text-slate-300">{card.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="sg-panel px-5 py-5 sm:px-6 sm:py-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
                Processing model
              </p>
              <h3 className="text-xl font-semibold text-white">
                From public events to read-only quality signals
              </h3>
            </div>
            <StatusBadge status="info" text="No write path" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {processSteps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
              >
                <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 font-mono text-xs font-semibold text-cyan-100">
                  {index + 1}
                </div>
                <h4 className="text-sm font-semibold text-white">{step.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="sg-panel px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
                Public boundary
              </p>
              <h3 className="text-xl font-semibold text-white">
                Built for observability, not execution
              </h3>
              <p className="text-sm leading-6 text-slate-300">
                SignalGuard RS focuses on data quality, pipeline health, market
                state, and anomalies. The web console stays outside trading and
                account surfaces.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {boundaryItems.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-3 text-sm text-emerald-100"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {landingLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
              {item.action}
            </p>
            <h3 className="mt-3 flex items-center justify-between gap-3 text-lg font-semibold text-white">
              {item.title}
              <span
                className="text-cyan-200 transition group-hover:translate-x-1"
                aria-hidden="true"
              >
                -&gt;
              </span>
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
          </Link>
        ))}
      </section>
    </section>
  );
}

function SignalTape() {
  return (
    <div className="border-t border-white/10 bg-slate-950/80 px-4 py-2.5 sm:px-6">
      <div className="flex gap-2.5 overflow-x-auto whitespace-nowrap pb-1 text-xs [scrollbar-width:none]">
        <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1.5 font-mono uppercase tracking-[0.18em] text-emerald-100">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Signal tape
        </span>
        {signalTapeItems.map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-slate-300"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConsolePreview() {
  return (
    <div className="border-t border-white/10 bg-[#07111a]/80 p-4 sm:p-5 xl:border-l xl:border-t-0">
      <div className="h-full rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
              Console preview
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Read-only monitoring contract
            </h3>
          </div>
          <StatusBadge status="healthy" text="Read only" />
        </div>

        <div className="space-y-3">
          {previewRows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 sm:grid-cols-[7rem_1fr] sm:gap-3"
            >
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                {row.label}
              </p>
              <p className={`text-sm font-medium ${row.tone}`}>{row.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <PreviewList title="Detector labels" items={detectorLabels} tone="warning" />
          <PreviewList title="API endpoints" items={endpointLabels} tone="info" />
        </div>
      </div>
    </div>
  );
}

function PreviewList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "info" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-400/15 bg-amber-400/[0.04] text-amber-100"
      : "border-cyan-400/15 bg-cyan-400/[0.04] text-cyan-100";

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-3">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${toneClass}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function capabilityToneClass(tone: string): string {
  switch (tone) {
    case "green":
      return "bg-emerald-400";
    case "amber":
      return "bg-amber-400";
    case "blue":
      return "bg-blue-400";
    default:
      return "bg-cyan-400";
  }
}
