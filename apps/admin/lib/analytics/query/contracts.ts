import { z } from "zod";

export const USAGE_QUERY_SCHEMA_VERSION = "1" as const;
export const USAGE_QUERY_CONTRACT_VERSION = "usage-query-v1";
export const USAGE_ACCOUNTING_POLICY_VERSION = "source-priority-v1";

export const usageMeasures = [
  "requests",
  "sessions",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "activeSeconds",
  "suggestedLines",
  "acceptedLines",
  "addedLines",
  "deletedLines",
  "commits",
  "pullRequests",
  "costMicros",
  "activeDevelopers",
] as const;

export const usageDimensions = [
  "day",
  "developer",
  "repository",
  "tool",
  "provider",
  "product",
  "model",
  "source",
  "metricKind",
  "costKind",
] as const;

export type UsageMeasure = (typeof usageMeasures)[number];
export type UsageDimension = (typeof usageDimensions)[number];
export type UsageOrderField = UsageMeasure | UsageDimension;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stringList = z.array(z.string().min(1).max(256)).max(50).optional();

export const usageQueryV1Schema = z
  .object({
    schemaVersion: z.literal(USAGE_QUERY_SCHEMA_VERSION).default(USAGE_QUERY_SCHEMA_VERSION),
    window: z.union([
      z.object({ preset: z.union([z.literal(7), z.literal(30), z.literal(90)]) }).strict(),
      z.object({ from: dateOnly, to: dateOnly }).strict(),
    ]),
    timezone: z.literal("UTC").default("UTC"),
    measures: z.array(z.enum(usageMeasures)).min(1).max(usageMeasures.length),
    dimensions: z.array(z.enum(usageDimensions)).max(3).default([]),
    filters: z
      .object({
        developerIds: stringList,
        repositoryIds: stringList,
        toolNames: stringList,
        providers: stringList,
        products: stringList,
        models: stringList,
        sources: stringList,
        metricKinds: stringList,
        costKinds: stringList,
      })
      .strict()
      .default({}),
    orderBy: z
      .array(
        z
          .object({
            field: z.enum([...usageDimensions, ...usageMeasures] as [UsageOrderField, ...UsageOrderField[]]),
            direction: z.enum(["asc", "desc"]).default("asc"),
          })
          .strict(),
      )
      .max(3)
      .default([]),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type UsageQueryV1 = z.input<typeof usageQueryV1Schema>;

export type NormalizedUsageQueryV1 = {
  schemaVersion: "1";
  window: { from: string; to: string; grain: "day" };
  timezone: "UTC";
  measures: UsageMeasure[];
  dimensions: UsageDimension[];
  filters: {
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
  orderBy: Array<{ field: UsageOrderField; direction: "asc" | "desc" }>;
  limit: number;
};

export type AnalyticsScope = {
  orgId: string;
  actorId: string;
  role: "owner" | "admin" | "developer";
  developerId?: string;
};

export type AnalyticsQueryRow = {
  dimensions: Partial<Record<UsageDimension, string>>;
  measures: Partial<Record<UsageMeasure, number | string>>;
};

export type AnalyticsCacheStatus = "hit" | "miss" | "refresh" | "bypass";

export type UsageQueryEnvelopeV1 = {
  schemaVersion: "1";
  kind: "usage-query";
  generatedAt: string;
  dataThrough: string | null;
  timezone: "UTC";
  window: { from: string; to: string; grain: "day" };
  data: { rows: AnalyticsQueryRow[] };
  meta: {
    cache: { status: AnalyticsCacheStatus; expiresAt: string | null };
  };
};
