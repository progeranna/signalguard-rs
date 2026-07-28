import {
  formatActiveAnomalyLabel,
  formatDetectorLabel,
  getAnomalySeverityDescriptor,
} from "./statusDescriptors";
import type { DashboardAnomaly } from "./types";

export const RECENT_ANOMALIES_PREVIEW_LIMIT = 7;

export type RecentAnomaliesPreviewRow = Readonly<{
  id: DashboardAnomaly["id"];
  symbol: DashboardAnomaly["symbol"];
  anomalyType: DashboardAnomaly["anomaly_type"];
  detectorLabel: string;
  severity: DashboardAnomaly["severity"];
  severityDescriptor: ReturnType<typeof getAnomalySeverityDescriptor>;
  activeLabel: string;
  message: DashboardAnomaly["message"];
  observedValue: DashboardAnomaly["observed_value"];
  thresholdValue: DashboardAnomaly["threshold_value"];
  eventTime: DashboardAnomaly["event_time"];
  createdAt: DashboardAnomaly["created_at"];
  effectiveTimestampMs: number | null;
}>;

export type RecentAnomaliesPreviewResult = Readonly<{
  allRows: readonly RecentAnomaliesPreviewRow[];
  rows: readonly RecentAnomaliesPreviewRow[];
  limit: number;
  totalCount: number;
  hiddenCount: number;
  hasMore: boolean;
  isEmpty: boolean;
}>;

export function mapDashboardAnomalyToRecentPreviewRow(
  anomaly: DashboardAnomaly,
): RecentAnomaliesPreviewRow {
  const eventTimestampMs = parseTimestamp(anomaly.event_time);
  const createdTimestampMs = parseTimestamp(anomaly.created_at);

  return {
    id: anomaly.id,
    symbol: anomaly.symbol,
    anomalyType: anomaly.anomaly_type,
    detectorLabel: formatDetectorLabel(anomaly.anomaly_type),
    severity: anomaly.severity,
    severityDescriptor: getAnomalySeverityDescriptor(anomaly.severity),
    activeLabel: formatActiveAnomalyLabel(anomaly.severity, anomaly.anomaly_type),
    message: anomaly.message,
    observedValue: anomaly.observed_value,
    thresholdValue: anomaly.threshold_value,
    eventTime: anomaly.event_time,
    createdAt: anomaly.created_at,
    effectiveTimestampMs: eventTimestampMs ?? createdTimestampMs,
  };
}

export function buildRecentAnomaliesPreview(
  anomalies: readonly DashboardAnomaly[],
  limit = RECENT_ANOMALIES_PREVIEW_LIMIT,
): RecentAnomaliesPreviewResult {
  assertPreviewLimit(limit);

  const seenIds = new Set<string>();
  const allRows = anomalies.map((anomaly) => {
    if (seenIds.has(anomaly.id)) {
      throw new TypeError(`Duplicate anomaly id: ${anomaly.id}`);
    }

    seenIds.add(anomaly.id);
    return mapDashboardAnomalyToRecentPreviewRow(anomaly);
  });

  allRows.sort(compareRecentAnomalies);

  const rows = allRows.slice(0, limit);
  const totalCount = allRows.length;
  const hiddenCount = Math.max(totalCount - rows.length, 0);

  return {
    allRows,
    rows,
    limit,
    totalCount,
    hiddenCount,
    hasMore: hiddenCount > 0,
    isEmpty: totalCount === 0,
  };
}

function compareRecentAnomalies(
  left: RecentAnomaliesPreviewRow,
  right: RecentAnomaliesPreviewRow,
): number {
  const effectiveTimeComparison = compareDescending(
    left.effectiveTimestampMs ?? Number.NEGATIVE_INFINITY,
    right.effectiveTimestampMs ?? Number.NEGATIVE_INFINITY,
  );

  if (effectiveTimeComparison !== 0) {
    return effectiveTimeComparison;
  }

  const createdTimeComparison = compareDescending(
    parseTimestamp(left.createdAt) ?? Number.NEGATIVE_INFINITY,
    parseTimestamp(right.createdAt) ?? Number.NEGATIVE_INFINITY,
  );

  if (createdTimeComparison !== 0) {
    return createdTimeComparison;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
}

function compareDescending(left: number, right: number): number {
  if (left === right) {
    return 0;
  }

  return left > right ? -1 : 1;
}

function parseTimestamp(value: string): number | null {
  const timestampMs = Date.parse(value);

  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function assertPreviewLimit(limit: number): void {
  if (!Number.isFinite(limit) || !Number.isInteger(limit)) {
    throw new TypeError("limit must be a finite integer");
  }

  if (limit < 0) {
    throw new RangeError("limit must be non-negative");
  }
}
