import type { MetricWindow } from "./time-window";

export type UsageMeasure = "requests" | "inputTokens" | "outputTokens" | "cost";

export type UsageDimension = "time" | "developer" | "tool" | "provider" | "model";

export type UsageMetricQuery = {
  orgId: string;
  window: MetricWindow;
  measures: UsageMeasure[];
  dimensions?: UsageDimension[];
  developerIds?: string[];
  toolNames?: string[];
};

export type MetricRow = {
  dimensions: Partial<Record<UsageDimension, string>>;
  measures: Partial<Record<UsageMeasure, number>>;
};

/** Raw usage facts for calculateBilling — still fetched only through the metrics port. */
export type BillingUsageFact = {
  date: Date;
  developerId: string | null;
  provider: string;
  product: string;
  toolName: string;
  source: string;
  costMicros: bigint;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  observedAt: Date;
};

export interface UsageMetricsStore {
  query(request: UsageMetricQuery): Promise<MetricRow[]>;
  dataThrough(orgId: string): Promise<Date | null>;
  billingFacts(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }): Promise<BillingUsageFact[]>;
  /** Deduped-ready raw usage rows for KPI aggregation (still only via this port). */
  activityRows(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }): Promise<Awaited<ReturnType<typeof import("@/lib/metrics/model-usage").fetchUsageRows>>>;
}
