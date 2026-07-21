import { z } from "zod";

import { parseSymbolId } from "./symbolId";

export const serviceSummarySchema = z.object({
  status: z.literal("ok"),
  service: z.literal("signalguard-rs"),
});

export const pipelineStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);

export const pipelineHealthSchema = z.object({
  status: pipelineStatusSchema,
  last_message_age_ms: z.number().int().nonnegative().nullable(),
  parse_errors: z.number().int().nonnegative(),
  reconnect_attempts: z.number().int().nonnegative(),
  storage_errors: z.number().int().nonnegative(),
  cache_errors: z.number().int().nonnegative(),
});

export const dashboardStateSummarySchema = z.object({
  last_trade_price: z.string().nullable(),
  best_bid_price: z.string().nullable(),
  best_ask_price: z.string().nullable(),
  spread_pct: z.number().nullable(),
  price_change_1m_pct: z.number().nullable(),
  trades_per_minute: z.number().nullable(),
  last_event_time: z.string().datetime().nullable(),
  last_event_age_ms: z.number().int().nonnegative().nullable(),
  depth_sequence_gap_count: z.number().int().nonnegative(),
});

export const healthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);

export const dashboardHealthSummarySchema = z.object({
  score: z.number().int().min(0).max(100),
  status: healthStatusSchema,
  recent_anomaly_count: z.number().int().nonnegative(),
  evaluated_at: z.string().datetime(),
});

export const symbolIdSchema = z.string().transform((value, context): string => {
  const symbolId = parseSymbolId(value);

  if (!symbolId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "symbol must contain only ASCII letters and digits",
    });
    return z.NEVER;
  }

  return symbolId;
});

export const anomalySeveritySchema = z.enum(["info", "warning", "critical"]);

export const anomalySchema = z.object({
  id: z.string().uuid(),
  symbol: symbolIdSchema,
  anomaly_type: z.string(),
  severity: anomalySeveritySchema,
  message: z.string(),
  observed_value: z.number().nullable(),
  threshold_value: z.number().nullable(),
  event_time: z.string().datetime(),
  created_at: z.string().datetime(),
});

export const dashboardSymbolSummarySchema = z.object({
  symbol: symbolIdSchema,
  state: dashboardStateSummarySchema.nullable(),
  health: dashboardHealthSummarySchema.nullable(),
});

export const dashboardSummarySchema = z.object({
  service: serviceSummarySchema,
  pipeline: pipelineHealthSchema,
  symbols: z.array(dashboardSymbolSummarySchema),
  recent_anomalies: z.array(anomalySchema),
});

export const marketTimelinePointSchema = z.object({
  timestamp: z.string().datetime(),
  price: z.string(),
  spread_pct: z.number().nullable(),
  trades_per_minute: z.number().nullable(),
  last_event_age_ms: z.number().int().nonnegative().nullable(),
});

export const marketTimelineSchema = z.object({
  symbol: symbolIdSchema,
  points: z.array(marketTimelinePointSchema),
  anomalies: z.array(anomalySchema),
});

export const uiModeSchema = z.enum(["demo", "live"]);
export const runtimeModeSchema = z.enum(["replay", "live"]);
export const runtimeModeStatusSchema = z.enum([
  "starting",
  "running",
  "switching",
  "failed",
  "stopped",
  "completed",
]);
export const runtimeModeSourceSchema = z.enum(["config", "runtime"]);

export const runtimeModeResponseSchema = z.object({
  mode: runtimeModeSchema,
  mode_label: z.string(),
  status: runtimeModeStatusSchema,
  symbols: z.array(symbolIdSchema),
  switching_supported: z.boolean(),
  source: runtimeModeSourceSchema,
  last_started_at: z.string().datetime().nullable(),
  last_switched_at: z.string().datetime().nullable(),
  last_error: z.string().nullable(),
});

export const DEFAULT_UI_MODE = "demo" satisfies UiMode;

export function parseUiMode(value: string | null | undefined): UiMode | null {
  const parsed = uiModeSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

export type PipelineHealth = z.infer<typeof pipelineHealthSchema>;
export type DashboardStateSummary = z.infer<typeof dashboardStateSummarySchema>;
export type DashboardHealthSummary = z.infer<typeof dashboardHealthSummarySchema>;
export type DashboardSymbolSummary = z.infer<typeof dashboardSymbolSummarySchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type DashboardAnomaly = z.infer<typeof anomalySchema>;
export type MarketTimelinePoint = z.infer<typeof marketTimelinePointSchema>;
export type MarketTimeline = z.infer<typeof marketTimelineSchema>;
export type UiMode = z.infer<typeof uiModeSchema>;
export type RuntimeMode = z.infer<typeof runtimeModeSchema>;
export type RuntimeModeStatus = z.infer<typeof runtimeModeStatusSchema>;
export type RuntimeModeSource = z.infer<typeof runtimeModeSourceSchema>;
export type RuntimeModeResponse = z.infer<typeof runtimeModeResponseSchema>;
