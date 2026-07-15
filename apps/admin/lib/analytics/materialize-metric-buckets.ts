import { prisma } from "@usejunction/db";
import {
  ANALYTICS_KIND_METRIC_DAILY,
  METRIC_VERSION,
} from "@/lib/analytics/metric-version";
import { DAY_MS, usageDayFilter, utcDateOnly } from "@/lib/metrics/date-range";
import {
  selectUsageRows,
  type SelectedUsageRow,
} from "@/lib/metrics/model-usage";
import { costKindForRow, isObservedSource, isProductivityMetric } from "@/lib/metrics/source-priority";

type BucketAccum = {
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
  sourceObservedThrough: Date | null;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rowMetricKind(row: SelectedUsageRow): string {
  if (row.metricKind) return row.metricKind;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).metricKind;
    if (typeof value === "string") return value;
  }
  return "usage";
}

function cacheWrite(row: SelectedUsageRow): bigint {
  if (row.cacheWriteTokens && row.cacheWriteTokens > BigInt(0)) return row.cacheWriteTokens;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).cacheWriteTokens;
    if (typeof value === "number") return BigInt(Math.round(value));
  }
  return BigInt(0);
}

function reasoning(row: SelectedUsageRow): bigint {
  if (row.reasoningTokens && row.reasoningTokens > BigInt(0)) return row.reasoningTokens;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).reasoningTokens;
    if (typeof value === "number") return BigInt(Math.round(value));
  }
  return BigInt(0);
}

function bucketKey(parts: {
  date: Date;
  developerId: string;
  toolName: string;
  provider: string;
  model: string;
  metricKind: string;
}) {
  return [
    isoDay(parts.date),
    parts.developerId,
    parts.toolName,
    parts.provider,
    parts.model,
    parts.metricKind,
  ].join("|");
}

function emptyBucket(parts: {
  date: Date;
  developerId: string;
  toolName: string;
  provider: string;
  model: string;
  metricKind: string;
}): BucketAccum {
  return {
    ...parts,
    requests: 0,
    sessions: 0,
    inputTokens: BigInt(0),
    outputTokens: BigInt(0),
    cacheReadTokens: BigInt(0),
    cacheWriteTokens: BigInt(0),
    reasoningTokens: BigInt(0),
    suggestedLines: BigInt(0),
    acceptedLines: BigInt(0),
    addedLines: BigInt(0),
    deletedLines: BigInt(0),
    commits: 0,
    costMicros: BigInt(0),
    verifiedCostMicros: BigInt(0),
    estimatedCostMicros: BigInt(0),
    sourceObservedThrough: null,
  };
}

function touchObserved(bucket: BucketAccum, observedAt: Date | undefined) {
  if (!observedAt) return;
  if (!bucket.sourceObservedThrough || observedAt > bucket.sourceObservedThrough) {
    bucket.sourceObservedThrough = observedAt;
  }
}

/** Collapse source-deduped usage_daily rows into MetricDailyBucket dimension keys. */
export function accumulateBuckets(rows: SelectedUsageRow[]): BucketAccum[] {
  const map = new Map<string, BucketAccum>();
  const seenActivity = new Set<string>();
  const seenCost = new Set<string>();

  for (const row of rows) {
    const productivity =
      rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
    const metricKind = productivity ? "productivity" : "usage";
    const dims = {
      date: utcDateOnly(row.date),
      developerId: row.developerId ?? "",
      toolName: row.toolName || "",
      provider: row.provider || "",
      model: row.model || "",
      metricKind,
    };
    const key = bucketKey(dims);
    const bucket = map.get(key) ?? emptyBucket(dims);
    map.set(key, bucket);

    if (productivity) {
      bucket.suggestedLines += row.suggestedLines;
      bucket.acceptedLines += row.acceptedLines;
      bucket.addedLines += row.addedLines;
      bucket.deletedLines += row.deletedLines;
      bucket.commits += row.commits;
      touchObserved(bucket, (row as { observedAt?: Date }).observedAt);
      continue;
    }

    const activityDedup = [isoDay(row.date), row.developerId ?? "", row.toolName, row.model].join("|");
    if (row.selectedActivity && isObservedSource(row.source) && !seenActivity.has(activityDedup)) {
      seenActivity.add(activityDedup);
      bucket.requests += row.requests;
      bucket.sessions += row.sessions;
      bucket.inputTokens += row.inputTokens;
      bucket.outputTokens += row.outputTokens;
      bucket.cacheReadTokens += row.cacheReadTokens;
      bucket.cacheWriteTokens += cacheWrite(row);
      bucket.reasoningTokens += reasoning(row);
    }

    const costDedup = activityDedup;
    if (row.selectedCost && !seenCost.has(costDedup)) {
      seenCost.add(costDedup);
      bucket.costMicros += row.costMicros;
      const kind = row.costKind ?? costKindForRow(row);
      if (kind === "verified_usage") bucket.verifiedCostMicros += row.costMicros;
      else if (kind === "estimated_api" && isObservedSource(row.source)) {
        bucket.estimatedCostMicros += row.costMicros;
      }
    }

    touchObserved(bucket, (row as { observedAt?: Date }).observedAt);
  }

  return Array.from(map.values());
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

export type MaterializeResult = {
  orgId: string;
  metricVersion: string;
  daysProcessed: number;
  bucketsUpserted: number;
  cursorDate: string | null;
};

async function ensureWatermark(orgId: string, metricVersion: string) {
  return prisma.analyticsWatermark.upsert({
    where: {
      orgId_kind_metricVersion: {
        orgId,
        kind: ANALYTICS_KIND_METRIC_DAILY,
        metricVersion,
      },
    },
    create: {
      orgId,
      kind: ANALYTICS_KIND_METRIC_DAILY,
      metricVersion,
      status: "idle",
    },
    update: {},
  });
}

async function resolveDaysToProcess(input: {
  orgId: string;
  metricVersion: string;
  fromDate?: Date;
  toDate?: Date;
  now: Date;
}): Promise<Date[]> {
  const today = utcDateOnly(input.now);
  if (input.fromDate && input.toDate) {
    return enumerateDays(input.fromDate, input.toDate);
  }

  const watermark = await ensureWatermark(input.orgId, input.metricVersion);
  const dirty = await prisma.analyticsDirtyDay.findMany({
    where: { orgId: input.orgId, metricVersion: input.metricVersion },
    select: { date: true },
  });

  const days = new Map<string, Date>();
  for (const row of dirty) {
    days.set(isoDay(row.date), utcDateOnly(row.date));
  }

  // Incremental: from cursor (exclusive next day) through today; first run backfills from earliest fact.
  let from = watermark.cursorDate
    ? new Date(utcDateOnly(watermark.cursorDate).getTime() + DAY_MS)
    : null;

  if (!from) {
    const earliest = await prisma.usageDaily.findFirst({
      where: { orgId: input.orgId },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    from = earliest ? utcDateOnly(earliest.date) : today;
  }

  // Always rematerialize today (live gap / late sync).
  if (from.getTime() > today.getTime()) from = today;

  for (const day of enumerateDays(from, today)) {
    days.set(isoDay(day), day);
  }

  // Also rematerialize the cursor day itself if dirty or if we have no dirty list and cursor is yesterday+.
  if (watermark.cursorDate) {
    const cursor = utcDateOnly(watermark.cursorDate);
    days.set(isoDay(cursor), cursor);
  }

  return Array.from(days.values()).sort((a, b) => a.getTime() - b.getTime());
}

export async function materializeOrgBuckets(input: {
  orgId: string;
  fromDate?: Date;
  toDate?: Date;
  metricVersion?: string;
  now?: Date;
}): Promise<MaterializeResult> {
  const metricVersion = input.metricVersion ?? METRIC_VERSION;
  const now = input.now ?? new Date();
  const orgId = input.orgId;

  await ensureWatermark(orgId, metricVersion);
  await prisma.analyticsWatermark.update({
    where: {
      orgId_kind_metricVersion: {
        orgId,
        kind: ANALYTICS_KIND_METRIC_DAILY,
        metricVersion,
      },
    },
    data: { status: "running", lastError: null },
  });

  try {
    const days = await resolveDaysToProcess({
      orgId,
      metricVersion,
      fromDate: input.fromDate,
      toDate: input.toDate,
      now,
    });

    if (days.length === 0) {
      await prisma.analyticsWatermark.update({
        where: {
          orgId_kind_metricVersion: {
            orgId,
            kind: ANALYTICS_KIND_METRIC_DAILY,
            metricVersion,
          },
        },
        data: { status: "idle" },
      });
      return {
        orgId,
        metricVersion,
        daysProcessed: 0,
        bucketsUpserted: 0,
        cursorDate: null,
      };
    }

    const from = days[0]!;
    const to = days[days.length - 1]!;
    const facts = await prisma.usageDaily.findMany({
      where: {
        orgId,
        date: usageDayFilter(from, to),
        OR: [{ calculationVersion: null }, { calculationVersion: { not: "usage-v1-stale" } }],
      },
      select: {
        date: true,
        developerId: true,
        toolName: true,
        model: true,
        provider: true,
        source: true,
        verified: true,
        requests: true,
        sessions: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        reasoningTokens: true,
        suggestedLines: true,
        acceptedLines: true,
        addedLines: true,
        deletedLines: true,
        commits: true,
        costMicros: true,
        metricKind: true,
        costKind: true,
        metadata: true,
        observedAt: true,
      },
    });

    // Group facts by day so we can wipe+rewrite only processed days.
    const byDay = new Map<string, typeof facts>();
    for (const fact of facts) {
      const key = isoDay(fact.date);
      const list = byDay.get(key) ?? [];
      list.push(fact);
      byDay.set(key, list);
    }

    let bucketsUpserted = 0;
    let maxObserved: Date | null = null;
    const today = utcDateOnly(now);

    for (const day of days) {
      const dayKey = isoDay(day);
      const dayFacts = byDay.get(dayKey) ?? [];
      const selected = selectUsageRows(dayFacts);
      const buckets = accumulateBuckets(selected as SelectedUsageRow[]);

      await prisma.metricDailyBucket.deleteMany({
        where: {
          orgId,
          metricVersion,
          date: day,
        },
      });

      for (const bucket of buckets) {
        await prisma.metricDailyBucket.create({
          data: {
            orgId,
            date: bucket.date,
            developerId: bucket.developerId,
            toolName: bucket.toolName,
            provider: bucket.provider,
            model: bucket.model,
            metricKind: bucket.metricKind,
            metricVersion,
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
            costMicros: bucket.costMicros,
            verifiedCostMicros: bucket.verifiedCostMicros,
            estimatedCostMicros: bucket.estimatedCostMicros,
            computedAt: now,
            sourceObservedThrough: bucket.sourceObservedThrough,
          },
        });
        bucketsUpserted += 1;
        if (bucket.sourceObservedThrough) {
          if (!maxObserved || bucket.sourceObservedThrough > maxObserved) {
            maxObserved = bucket.sourceObservedThrough;
          }
        }
      }

      await prisma.analyticsDirtyDay.deleteMany({
        where: { orgId, metricVersion, date: day },
      });
    }

    // Cursor advances through yesterday; today stays open for live gap / dirty rematerialize.
    const sealedEnd = new Date(today.getTime() - DAY_MS);
    const maxProcessed = days.reduce((max, d) => (d > max ? d : max), days[0]!);
    const cursorDate = maxProcessed.getTime() <= sealedEnd.getTime() ? maxProcessed : sealedEnd;

    await prisma.analyticsWatermark.update({
      where: {
        orgId_kind_metricVersion: {
          orgId,
          kind: ANALYTICS_KIND_METRIC_DAILY,
          metricVersion,
        },
      },
      data: {
        status: "idle",
        cursorDate: cursorDate.getTime() >= utcDateOnly(from).getTime() ? cursorDate : null,
        cursorObservedAt: maxObserved ?? now,
        lastError: null,
      },
    });

    return {
      orgId,
      metricVersion,
      daysProcessed: days.length,
      bucketsUpserted,
      cursorDate: cursorDate.toISOString().slice(0, 10),
    };
  } catch (error) {
    await prisma.analyticsWatermark.update({
      where: {
        orgId_kind_metricVersion: {
          orgId,
          kind: ANALYTICS_KIND_METRIC_DAILY,
          metricVersion,
        },
      },
      data: {
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function materializeActiveOrgs(input?: {
  metricVersion?: string;
  limit?: number;
  now?: Date;
}): Promise<MaterializeResult[]> {
  const metricVersion = input?.metricVersion ?? METRIC_VERSION;
  const now = input?.now ?? new Date();
  const lookback = new Date(now.getTime() - 14 * DAY_MS);

  const dirtyOrgs = await prisma.analyticsDirtyDay.findMany({
    where: { metricVersion },
    distinct: ["orgId"],
    select: { orgId: true },
    take: input?.limit ?? 50,
  });

  const recentOrgs = await prisma.usageDaily.findMany({
    where: { observedAt: { gte: lookback } },
    distinct: ["orgId"],
    select: { orgId: true },
    take: input?.limit ?? 50,
  });

  const orgIds = [...new Set([...dirtyOrgs.map((r) => r.orgId), ...recentOrgs.map((r) => r.orgId)])];
  const results: MaterializeResult[] = [];
  for (const orgId of orgIds.slice(0, input?.limit ?? 50)) {
    results.push(await materializeOrgBuckets({ orgId, metricVersion, now }));
  }
  return results;
}
