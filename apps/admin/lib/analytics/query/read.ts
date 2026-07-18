import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type {
  AnalyticsQueryRow,
  AnalyticsScope,
  UsageDimension,
  UsageMeasure,
} from "./contracts";
import { executeUsageQuery } from "./execute";

export function internalAnalyticsScope(orgId: string, developerId?: string): AnalyticsScope {
  return {
    orgId,
    actorId: "system:read-model",
    role: developerId ? "user" : "admin",
    ...(developerId ? { developerId } : {}),
  };
}

export async function readUsageMetrics(input: {
  orgId: string;
  developerId?: string;
  window: MetricWindow | { from: Date; to: Date };
  measures: UsageMeasure[];
  dimensions?: UsageDimension[];
  filters?: {
    developerIds?: string[];
    repositoryIds?: string[];
    toolNames?: string[];
    providers?: string[];
    products?: string[];
    models?: string[];
    sources?: string[];
    metricKinds?: string[];
    costKinds?: string[];
  };
  limit?: number;
}) {
  return executeUsageQuery(internalAnalyticsScope(input.orgId, input.developerId), {
    schemaVersion: "1",
    window: {
      from: input.window.from.toISOString().slice(0, 10),
      to: input.window.to.toISOString().slice(0, 10),
    },
    timezone: "UTC",
    measures: input.measures,
    dimensions: input.dimensions ?? [],
    filters: input.filters ?? {},
    limit: input.limit ?? 500,
  });
}

export function metricNumber(row: AnalyticsQueryRow | undefined, measure: UsageMeasure) {
  const value = row?.measures[measure];
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function metricBigInt(row: AnalyticsQueryRow | undefined, measure: UsageMeasure) {
  const value = row?.measures[measure];
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return BigInt(0);
}

export function dimension(row: AnalyticsQueryRow, key: UsageDimension) {
  return row.dimensions[key] ?? "";
}
