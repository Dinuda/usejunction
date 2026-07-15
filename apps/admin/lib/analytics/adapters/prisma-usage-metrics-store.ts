import { prisma } from "@usejunction/db";
import type {
  BillingUsageFact,
  MetricRow,
  UsageDimension,
  UsageMetricQuery,
  UsageMetricsStore,
} from "@/lib/analytics/contracts/usage-metrics";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getAnalyticsWatermark } from "@/lib/analytics/dirty-days";
import { METRIC_VERSION } from "@/lib/analytics/metric-version";
import { DAY_MS, usageDayFilter, utcDateOnly } from "@/lib/metrics/date-range";
import { fetchUsageRows, selectUsageRows } from "@/lib/metrics/model-usage";
import { isProductivityMetric } from "@/lib/metrics/source-priority";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dimensionKey(dimensions: UsageDimension[], values: Record<string, string>) {
  return dimensions.map((dimension) => `${dimension}=${values[dimension] ?? ""}`).join("|");
}

function rowMetricKind(row: { metricKind?: string | null; metadata: unknown; source: string }) {
  if (row.metricKind) return row.metricKind;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).metricKind;
    if (typeof value === "string") return value;
  }
  return "usage";
}

function enumerateDays(from: Date, to: Date): Date[] {
  const start = utcDateOnly(from);
  const end = utcDateOnly(to);
  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    days.push(new Date(t));
  }
  return days;
}

type UsageFactRow = Awaited<ReturnType<typeof fetchUsageRows>>[number];

/** Map retained buckets into UsageRow shape so existing KPI helpers keep working. */
function bucketsAsUsageRows(
  buckets: Array<{
    date: Date;
    developerId: string;
    toolName: string;
    provider: string;
    model: string;
    metricKind: string;
    requests: number;
    sessions: number;
    inputTokens: bigint;
    outputTokens: bigint;
    cacheReadTokens: bigint;
    cacheWriteTokens: bigint;
    reasoningTokens: bigint;
    suggestedLines: bigint;
    acceptedLines: bigint;
    addedLines: bigint;
    deletedLines: bigint;
    commits: number;
    costMicros: bigint;
    verifiedCostMicros: bigint;
    estimatedCostMicros: bigint;
  }>,
): UsageFactRow[] {
  return buckets.map((bucket) => {
    const productivity = bucket.metricKind === "productivity";
    const costMicros =
      bucket.verifiedCostMicros > BigInt(0)
        ? bucket.verifiedCostMicros
        : bucket.estimatedCostMicros > BigInt(0)
          ? bucket.estimatedCostMicros
          : bucket.costMicros;
    const costKind =
      bucket.verifiedCostMicros > BigInt(0)
        ? "verified_usage"
        : bucket.estimatedCostMicros > BigInt(0)
          ? "estimated_api"
          : null;
    return {
      date: bucket.date,
      developerId: bucket.developerId || null,
      toolName: bucket.toolName,
      model: bucket.model,
      provider: bucket.provider,
      source: "vendor_verified",
      verified: true,
      requests: bucket.requests,
      sessions: bucket.sessions,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      cacheReadTokens: bucket.cacheReadTokens,
      cacheWriteTokens: bucket.cacheWriteTokens,
      reasoningTokens: bucket.reasoningTokens,
      suggestedLines: bucket.suggestedLines,
      acceptedLines: bucket.acceptedLines,
      addedLines: bucket.addedLines,
      deletedLines: bucket.deletedLines,
      commits: bucket.commits,
      costMicros,
      metricKind: productivity ? "productivity" : "usage",
      costKind,
      metadata: { materialized: true, metricVersion: METRIC_VERSION },
    };
  });
}

async function resolveReadPlan(input: {
  orgId: string;
  from: Date;
  to: Date;
  metricVersion: string;
}) {
  const watermark = await getAnalyticsWatermark(input.orgId, input.metricVersion);
  const dirty = await prisma.analyticsDirtyDay.findMany({
    where: {
      orgId: input.orgId,
      metricVersion: input.metricVersion,
      date: usageDayFilter(input.from, input.to),
    },
    select: { date: true },
  });
  const dirtySet = new Set(dirty.map((row) => isoDay(row.date)));
  const sealedThrough = watermark?.cursorDate ? utcDateOnly(watermark.cursorDate) : null;

  const sealedDays: Date[] = [];
  const gapDays: Date[] = [];
  for (const day of enumerateDays(input.from, input.to)) {
    const sealed =
      sealedThrough != null &&
      day.getTime() <= sealedThrough.getTime() &&
      !dirtySet.has(isoDay(day));
    if (sealed) sealedDays.push(day);
    else gapDays.push(day);
  }
  return { sealedDays, gapDays, sealedThrough };
}

async function loadBucketRows(input: {
  orgId: string;
  days: Date[];
  metricVersion: string;
  developerId?: string;
}) {
  if (input.days.length === 0) return [];
  const from = input.days[0]!;
  const to = input.days[input.days.length - 1]!;
  const daySet = new Set(input.days.map(isoDay));
  const rows = await prisma.metricDailyBucket.findMany({
    where: {
      orgId: input.orgId,
      metricVersion: input.metricVersion,
      date: usageDayFilter(from, to),
      ...(input.developerId ? { developerId: input.developerId } : {}),
    },
  });
  return rows.filter((row) => daySet.has(isoDay(row.date)));
}

export class PrismaUsageMetricsStore implements UsageMetricsStore {
  constructor(private readonly metricVersion = METRIC_VERSION) {}

  private async loadMergedActivityRows(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }): Promise<UsageFactRow[]> {
    const plan = await resolveReadPlan({
      orgId: request.orgId,
      from: request.window.from,
      to: request.window.to,
      metricVersion: this.metricVersion,
    });

    const [bucketRows, liveRows] = await Promise.all([
      loadBucketRows({
        orgId: request.orgId,
        days: plan.sealedDays,
        metricVersion: this.metricVersion,
        developerId: request.developerId,
      }),
      plan.gapDays.length > 0
        ? fetchUsageRows({
            orgId: request.orgId,
            developerId: request.developerId,
            from: plan.gapDays[0]!,
            to: plan.gapDays[plan.gapDays.length - 1]!,
          }).then((rows) => {
            const gapSet = new Set(plan.gapDays.map(isoDay));
            return rows.filter((row) => gapSet.has(isoDay(row.date)));
          })
        : Promise.resolve([] as UsageFactRow[]),
    ]);

    return [...bucketsAsUsageRows(bucketRows), ...liveRows];
  }

  async query(request: UsageMetricQuery): Promise<MetricRow[]> {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }

    const developerId =
      request.developerIds?.length === 1 ? request.developerIds[0] : undefined;

    let filtered = await this.loadMergedActivityRows({
      orgId: request.orgId,
      window: request.window,
      developerId,
    });

    if (request.developerIds && request.developerIds.length > 1) {
      const allowed = new Set(request.developerIds);
      filtered = filtered.filter((row) => row.developerId && allowed.has(row.developerId));
    }
    if (request.toolNames?.length) {
      const allowed = new Set(request.toolNames.map((name) => name.toLowerCase()));
      filtered = filtered.filter((row) => allowed.has((row.toolName || "").toLowerCase()));
    }

    const selected = selectUsageRows(filtered);
    const dimensions = request.dimensions?.length ? request.dimensions : (["time"] as UsageDimension[]);
    const measures = new Set(request.measures);
    const map = new Map<string, MetricRow>();

    for (const row of selected) {
      const productivity =
        rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
      if (productivity) continue;

      const values: Record<string, string> = {
        time: isoDay(row.date),
        developer: row.developerId ?? "",
        tool: row.toolName || "unknown",
        provider: row.provider || "",
        model: row.model || "",
      };
      const key = dimensionKey(dimensions, values);
      const entry = map.get(key) ?? {
        dimensions: Object.fromEntries(
          dimensions.map((dimension) => [dimension, values[dimension] ?? ""]),
        ) as MetricRow["dimensions"],
        measures: {},
      };

      if (row.selectedActivity) {
        if (measures.has("requests")) entry.measures.requests = (entry.measures.requests ?? 0) + row.requests;
        if (measures.has("inputTokens")) {
          entry.measures.inputTokens = (entry.measures.inputTokens ?? 0) + Number(row.inputTokens);
        }
        if (measures.has("outputTokens")) {
          entry.measures.outputTokens = (entry.measures.outputTokens ?? 0) + Number(row.outputTokens);
        }
      }
      if (row.selectedCost && measures.has("cost")) {
        entry.measures.cost = (entry.measures.cost ?? 0) + Number(row.costMicros) / 1_000_000;
      }

      map.set(key, entry);
    }

    return Array.from(map.values());
  }

  async dataThrough(orgId: string): Promise<Date | null> {
    const [watermark, latestFact, latestBucket] = await Promise.all([
      getAnalyticsWatermark(orgId, this.metricVersion),
      prisma.usageDaily.findFirst({
        where: { orgId },
        orderBy: [{ date: "desc" }, { observedAt: "desc" }],
        select: { date: true },
      }),
      prisma.metricDailyBucket.findFirst({
        where: { orgId, metricVersion: this.metricVersion },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
    ]);
    const candidates = [watermark?.cursorDate, latestFact?.date, latestBucket?.date].filter(
      (value): value is Date => Boolean(value),
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((max, date) => (date > max ? date : max));
  }

  async billingFacts(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }): Promise<BillingUsageFact[]> {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }
    // Billing still needs source-level facts for calculateBilling provenance.
    const rows = await prisma.usageDaily.findMany({
      where: {
        orgId: request.orgId,
        ...(request.developerId ? { developerId: request.developerId } : {}),
        date: usageDayFilter(request.window.from, request.window.to),
        OR: [{ calculationVersion: null }, { calculationVersion: { not: "usage-v1-stale" } }],
      },
      select: {
        date: true,
        developerId: true,
        provider: true,
        product: true,
        toolName: true,
        source: true,
        costMicros: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        observedAt: true,
      },
    });
    return rows.map((row) => ({
      date: row.date,
      developerId: row.developerId,
      provider: row.provider,
      product: row.product,
      toolName: row.toolName,
      source: row.source,
      costMicros: row.costMicros,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      observedAt: row.observedAt,
    }));
  }

  async activityRows(request: {
    orgId: string;
    window: MetricWindow;
    developerId?: string;
  }) {
    if (request.window.timezone !== UTC_TIMEZONE) {
      throw new Error(`PrismaUsageMetricsStore v1 supports UTC only, got ${request.window.timezone}`);
    }
    return this.loadMergedActivityRows(request);
  }
}

export function createUsageMetricsStore(): UsageMetricsStore {
  return new PrismaUsageMetricsStore();
}
