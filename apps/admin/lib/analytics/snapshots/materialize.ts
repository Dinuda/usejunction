import { randomBytes } from "crypto";
import { prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";
import { CALCULATION_VERSION, PRICING_VERSION } from "@/lib/metrics/source-priority";

export const ORG_DAY_SNAPSHOT_VERSION = `org-day-snap-v1:${CALCULATION_VERSION}:${PRICING_VERSION}`;
export const ORG_DAY_WATERMARK_KIND = "org_usage_day";

/** Prevent parallel ensure/materialize races for the same org (current+previous windows). */
const orgMaterializeLocks = new Map<string, Promise<void>>();

/** Avoid Slack spam if recovery keeps failing for the same org. */
const failsafeAlertAt = new Map<string, number>();
const FAILSAFE_ALERT_COOLDOWN_MS = 15 * 60_000;

function alertSnapshotFailsafe(
  scope: string,
  orgId: string,
  error: unknown,
  details?: Record<string, unknown>,
) {
  const now = Date.now();
  const last = failsafeAlertAt.get(orgId) ?? 0;
  if (now - last < FAILSAFE_ALERT_COOLDOWN_MS) {
    if (details) console.error(`[${scope}]`, error, details);
    else console.error(`[${scope}]`, error);
    return;
  }
  failsafeAlertAt.set(orgId, now);
  logServerError(scope, error, { orgId, ...details });
}

function collapseDaysToRanges(days: Date[]): Array<{ from: Date; to: Date }> {
  const ranges: Array<{ from: Date; to: Date }> = [];
  for (const day of days) {
    const last = ranges[ranges.length - 1];
    if (last && day.getTime() === last.to.getTime() + 86_400_000) {
      last.to = day;
    } else {
      ranges.push({ from: day, to: day });
    }
  }
  return ranges;
}

function newId() {
  return `c${randomBytes(12).toString("hex")}`;
}

function utcDay(date: Date | string): Date {
  if (typeof date === "string") return new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDayInclusive(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let cursor = utcDay(from).getTime(); cursor <= utcDay(to).getTime(); cursor += 86_400_000) {
    days.push(new Date(cursor));
  }
  return days;
}

async function withOrgLock(orgId: string, work: () => Promise<void>): Promise<void> {
  const previous = orgMaterializeLocks.get(orgId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => gate);
  orgMaterializeLocks.set(orgId, next);
  await previous;
  try {
    await work();
  } finally {
    release();
    if (orgMaterializeLocks.get(orgId) === next) orgMaterializeLocks.delete(orgId);
  }
}

/** Mark calendar days dirty so the next materialize pass recomputes only those days. */
export async function markOrgUsageDaysDirty(
  orgId: string,
  dates: Array<Date | string>,
  metricVersion: string = ORG_DAY_SNAPSHOT_VERSION,
): Promise<string[]> {
  const unique = [...new Set(dates.map((d) => isoDay(utcDay(d))))].sort();
  if (!unique.length) return [];

  await prisma.analyticsDirtyDay.createMany({
    data: unique.map((day) => ({
      id: newId(),
      orgId,
      date: utcDay(day),
      metricVersion,
    })),
    skipDuplicates: true,
  });
  return unique;
}

type RangeAggregateRow = {
  date: Date;
  toolName: string;
  isOrgTotal: number;
  requests: number;
  inputTokens: bigint;
  outputTokens: bigint;
  verifiedUsageCostMicros: bigint;
  estimatedApiCostMicros: bigint;
  actualSpendCostMicros: bigint;
  activeDevelopers: number;
  activeDeveloperIds: unknown;
  sourceObservedThrough: Date | null;
};

function parseDeveloperIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Materialize an entire [from, to] window in one SQL pass (one CTE over the range),
 * then replace snapshot rows for those days. Used by cron / Sync now — never from
 * the dashboard read path (which only stub-fills missing days).
 */
export async function materializeOrgUsageRange(
  orgId: string,
  from: Date | string,
  to: Date | string,
  metricVersion: string = ORG_DAY_SNAPSHOT_VERSION,
): Promise<number> {
  const fromDay = utcDay(from);
  const toDay = utcDay(to);
  if (toDay.getTime() < fromDay.getTime()) return 0;

  const fromKey = isoDay(fromDay);
  const toKey = isoDay(toDay);
  const now = new Date();
  const rangeDays = eachDayInclusive(fromDay, toDay);

  const rows = await prisma.$queryRaw<RangeAggregateRow[]>`
    WITH classified AS (
      SELECT usage_daily.*,
        CASE source
          WHEN 'local_scan' THEN 'device_observed'
          WHEN 'cursor_local' THEN 'device_observed'
          WHEN 'cursor_usage_events' THEN 'vendor_verified'
          WHEN 'cursor_plan_percent' THEN 'device_observed'
          ELSE source
        END AS normalized_source,
        CASE
          WHEN source = 'cursor_local' OR metric_kind = 'productivity' THEN 'productivity'
          ELSE COALESCE(NULLIF(metric_kind, ''), metadata->>'metricKind', 'usage')
        END AS effective_metric_kind,
        CASE
          WHEN cost_kind IS NOT NULL THEN cost_kind
          WHEN verified OR source IN ('vendor_verified', 'cursor_usage_events') THEN 'verified_usage'
          WHEN source = 'invoice_imported' THEN 'actual_spend'
          ELSE 'estimated_api'
        END AS effective_cost_kind,
        CASE
          WHEN source IN ('vendor_verified', 'cursor_usage_events') THEN 0
          WHEN source = 'otel_observed' THEN 1
          WHEN source IN ('device_observed', 'local_scan', 'cursor_local', 'cursor_plan_percent') THEN 2
          WHEN source = 'gateway_observed' THEN 3
          WHEN source = 'estimated' THEN 4
          ELSE 99
        END AS activity_priority,
        CASE
          WHEN source IN ('vendor_verified', 'cursor_usage_events', 'invoice_imported') THEN 0
          WHEN source = 'gateway_observed' THEN 1
          WHEN source IN ('estimated', 'device_observed', 'local_scan', 'cursor_local', 'cursor_plan_percent') THEN 2
          WHEN source = 'otel_observed' THEN 3
          ELSE 99
        END AS cost_priority
      FROM usage_daily
      WHERE org_id = ${orgId}
        AND date >= ${fromKey}::date
        AND date <= ${toKey}::date
    ), ranked AS (
      SELECT classified.*,
        MIN(activity_priority) FILTER (
          WHERE effective_metric_kind <> 'productivity'
            AND (requests > 0 OR sessions > 0 OR input_tokens > 0 OR output_tokens > 0 OR active_seconds > 0)
        ) OVER (
          PARTITION BY date, developer_id, provider, product, tool_name, model
        ) AS best_activity_priority,
        MIN(cost_priority) FILTER (WHERE cost_micros > 0) OVER (
          PARTITION BY date, provider
        ) AS best_cost_priority
      FROM classified
    ), canonical AS (
      SELECT ranked.*,
        effective_metric_kind <> 'productivity'
          AND normalized_source <> 'estimated'
          AND activity_priority = best_activity_priority
          AND (requests > 0 OR sessions > 0 OR input_tokens > 0 OR output_tokens > 0 OR active_seconds > 0)
          AS selected_activity,
        cost_micros > 0 AND cost_priority = best_cost_priority AS selected_cost
      FROM ranked
    ), selected AS (
      SELECT * FROM canonical
      WHERE selected_activity OR selected_cost OR effective_metric_kind = 'productivity'
    ), aggregates AS (
      SELECT
        date,
        CASE WHEN GROUPING(COALESCE(tool_name, '')) = 1 THEN '' ELSE COALESCE(tool_name, '') END AS tool_name_value,
        GROUPING(COALESCE(tool_name, '')) AS is_org_total,
        COALESCE(SUM(CASE WHEN selected_activity THEN requests ELSE 0 END), 0)::int AS requests,
        COALESCE(SUM(CASE WHEN selected_activity THEN input_tokens ELSE 0 END), 0)::bigint AS "inputTokens",
        COALESCE(SUM(CASE WHEN selected_activity THEN output_tokens ELSE 0 END), 0)::bigint AS "outputTokens",
        COALESCE(SUM(CASE WHEN selected_cost AND effective_cost_kind = 'verified_usage' THEN cost_micros ELSE 0 END), 0)::bigint AS "verifiedUsageCostMicros",
        COALESCE(SUM(CASE WHEN selected_cost AND effective_cost_kind = 'estimated_api' THEN cost_micros ELSE 0 END), 0)::bigint AS "estimatedApiCostMicros",
        COALESCE(SUM(CASE WHEN selected_cost AND effective_cost_kind = 'actual_spend' THEN cost_micros ELSE 0 END), 0)::bigint AS "actualSpendCostMicros",
        COUNT(DISTINCT developer_id) FILTER (WHERE selected_activity AND requests > 0)::int AS "activeDevelopers",
        COALESCE(
          jsonb_agg(DISTINCT developer_id) FILTER (WHERE selected_activity AND requests > 0 AND developer_id IS NOT NULL),
          '[]'::jsonb
        ) AS "activeDeveloperIds",
        MAX(observed_at) AS "sourceObservedThrough"
      FROM selected
      GROUP BY GROUPING SETS ((date, COALESCE(tool_name, '')), (date))
    )
    SELECT
      date,
      tool_name_value AS "toolName",
      is_org_total AS "isOrgTotal",
      requests,
      "inputTokens",
      "outputTokens",
      "verifiedUsageCostMicros",
      "estimatedApiCostMicros",
      "actualSpendCostMicros",
      "activeDevelopers",
      "activeDeveloperIds",
      "sourceObservedThrough"
    FROM aggregates
  `;

  const writeRows: Array<{
    orgId: string;
    date: Date;
    toolName: string;
    metricVersion: string;
    requests: number;
    inputTokens: bigint;
    outputTokens: bigint;
    verifiedUsageCostMicros: bigint;
    estimatedApiCostMicros: bigint;
    actualSpendCostMicros: bigint;
    activeDevelopers: number;
    activeDeveloperIds: string[];
    computedAt: Date;
    sourceObservedThrough: Date | null;
  }> = [];

  const daysWithData = new Set<string>();
  for (const row of rows) {
    const day = utcDay(row.date);
    const dayKey = isoDay(day);
    daysWithData.add(dayKey);
    const isOrgTotal = Number(row.isOrgTotal) === 1;
    const toolName = isOrgTotal ? "" : (row.toolName ?? "");
    if (!isOrgTotal && toolName === "") continue;
    writeRows.push({
      orgId,
      date: day,
      toolName,
      metricVersion,
      requests: Number(row.requests),
      inputTokens: BigInt(row.inputTokens),
      outputTokens: BigInt(row.outputTokens),
      verifiedUsageCostMicros: BigInt(row.verifiedUsageCostMicros),
      estimatedApiCostMicros: BigInt(row.estimatedApiCostMicros),
      actualSpendCostMicros: BigInt(row.actualSpendCostMicros),
      activeDevelopers: Number(row.activeDevelopers),
      activeDeveloperIds: parseDeveloperIds(row.activeDeveloperIds),
      computedAt: now,
      sourceObservedThrough: row.sourceObservedThrough,
    });
  }

  // Seal empty days so readers do not keep treating them as missing.
  for (const day of rangeDays) {
    if (daysWithData.has(isoDay(day))) continue;
    writeRows.push({
      orgId,
      date: day,
      toolName: "",
      metricVersion,
      requests: 0,
      inputTokens: BigInt(0),
      outputTokens: BigInt(0),
      verifiedUsageCostMicros: BigInt(0),
      estimatedApiCostMicros: BigInt(0),
      actualSpendCostMicros: BigInt(0),
      activeDevelopers: 0,
      activeDeveloperIds: [],
      computedAt: now,
      sourceObservedThrough: null,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.orgUsageDaySnapshot.deleteMany({
      where: {
        orgId,
        metricVersion,
        date: { gte: fromDay, lte: toDay },
      },
    });
    if (writeRows.length > 0) {
      // createMany has a practical bind limit; chunk large windows.
      const chunkSize = 500;
      for (let i = 0; i < writeRows.length; i += chunkSize) {
        await tx.orgUsageDaySnapshot.createMany({ data: writeRows.slice(i, i + chunkSize) });
      }
    }
    await tx.analyticsDirtyDay.deleteMany({
      where: {
        orgId,
        metricVersion,
        date: { gte: fromDay, lte: toDay },
      },
    });
    await tx.analyticsWatermark.upsert({
      where: {
        orgId_kind_metricVersion: {
          orgId,
          kind: ORG_DAY_WATERMARK_KIND,
          metricVersion,
        },
      },
      create: {
        orgId,
        kind: ORG_DAY_WATERMARK_KIND,
        metricVersion,
        cursorDate: toDay,
        status: "idle",
      },
      update: {
        cursorDate: toDay,
        status: "idle",
        lastError: null,
      },
    });
  });

  return writeRows.length;
}

export async function materializeOrgUsageDay(
  orgId: string,
  day: Date | string,
  metricVersion: string = ORG_DAY_SNAPSHOT_VERSION,
): Promise<number> {
  return materializeOrgUsageRange(orgId, day, day, metricVersion);
}

/** Rematerialize dirty days for an org as contiguous ranges (not per-day CTEs). */
export async function materializeDirtyOrgUsageDays(
  orgId: string,
  options: { limit?: number; metricVersion?: string; onlyWithin?: { from: Date; to: Date } } = {},
): Promise<{ days: number; rows: number }> {
  const metricVersion = options.metricVersion ?? ORG_DAY_SNAPSHOT_VERSION;
  const dirty = await prisma.analyticsDirtyDay.findMany({
    where: {
      orgId,
      metricVersion,
      ...(options.onlyWithin
        ? { date: { gte: utcDay(options.onlyWithin.from), lte: utcDay(options.onlyWithin.to) } }
        : {}),
    },
    orderBy: { date: "asc" },
    take: options.limit ?? 90,
    select: { date: true },
  });
  if (!dirty.length) return { days: 0, rows: 0 };

  // Collapse dirty days into contiguous ranges, then one CTE per range.
  const ranges: Array<{ from: Date; to: Date }> = [];
  for (const entry of dirty) {
    const day = utcDay(entry.date);
    const last = ranges[ranges.length - 1];
    if (last && day.getTime() === last.to.getTime() + 86_400_000) {
      last.to = day;
    } else {
      ranges.push({ from: day, to: day });
    }
  }

  let rows = 0;
  for (const range of ranges) {
    rows += await materializeOrgUsageRange(orgId, range.from, range.to, metricVersion);
  }
  return { days: dirty.length, rows };
}

/**
 * Cron / Sync-now entry point: rematerialize dirty days, and always refresh today
 * (plus yesterday) so rolling dashboards advance without hot-path rematerialize.
 */
export async function rematerializeOrgSnapshots(
  orgId: string,
  options: { metricVersion?: string; includeToday?: boolean } = {},
): Promise<{ dirtyDays: number; rows: number }> {
  const metricVersion = options.metricVersion ?? ORG_DAY_SNAPSHOT_VERSION;
  const today = utcDay(new Date());
  const yesterday = new Date(today.getTime() - 86_400_000);

  if (options.includeToday !== false) {
    await markOrgUsageDaysDirty(orgId, [yesterday, today], metricVersion);
  }

  const result = await materializeDirtyOrgUsageDays(orgId, {
    metricVersion,
    limit: 90,
  });
  return { dirtyDays: result.days, rows: result.rows };
}

/**
 * Empty stub days (requests=0, no observed-through) that still have usage_daily —
 * typically after someone wiped snapshots. Fail-safe rematerializes only those days.
 */
async function findEmptyStubDaysWithUsage(
  orgId: string,
  fromDay: Date,
  toDay: Date,
  metricVersion: string,
): Promise<Date[]> {
  const stubs = await prisma.orgUsageDaySnapshot.findMany({
    where: {
      orgId,
      metricVersion,
      toolName: "",
      date: { gte: fromDay, lte: toDay },
      requests: 0,
      sourceObservedThrough: null,
    },
    select: { date: true },
  });
  if (!stubs.length) return [];

  const stubKeys = new Set(stubs.map((row) => isoDay(row.date)));
  const usageDays = await prisma.usageDaily.groupBy({
    by: ["date"],
    where: {
      orgId,
      date: { gte: fromDay, lte: toDay },
      requests: { gt: 0 },
    },
  });

  return usageDays
    .map((row) => utcDay(row.date))
    .filter((day) => stubKeys.has(isoDay(day)))
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Read-path seal: insert empty org-total stubs for missing days.
 * Does not rematerialize warm/sealed days (cron / Sync now own freshness).
 * Fail-safe: if stubs conflict with usage_daily (e.g. snaps wiped), log+Slack and
 * rematerialize only the conflicting days so the dashboard recovers.
 */
export async function ensureOrgUsageDaySnapshots(
  orgId: string,
  from: Date,
  to: Date,
  options: { metricVersion?: string } = {},
): Promise<{ stubbed: number; hadCoverage: boolean; recovered: number }> {
  const metricVersion = options.metricVersion ?? ORG_DAY_SNAPSHOT_VERSION;
  const fromDay = utcDay(from);
  const toDay = utcDay(to);
  let stubbed = 0;
  let hadCoverage = false;
  let recovered = 0;

  try {
    await withOrgLock(orgId, async () => {
      const existing = await prisma.orgUsageDaySnapshot.findMany({
        where: {
          orgId,
          metricVersion,
          toolName: "",
          date: { gte: fromDay, lte: toDay },
        },
        select: { date: true },
      });
      hadCoverage = existing.length > 0;
      const have = new Set(existing.map((row) => isoDay(row.date)));
      const missing = eachDayInclusive(fromDay, toDay).filter((day) => !have.has(isoDay(day)));

      if (missing.length) {
        const now = new Date();
        await prisma.orgUsageDaySnapshot.createMany({
          data: missing.map((day) => ({
            orgId,
            date: day,
            toolName: "",
            metricVersion,
            requests: 0,
            inputTokens: BigInt(0),
            outputTokens: BigInt(0),
            verifiedUsageCostMicros: BigInt(0),
            estimatedApiCostMicros: BigInt(0),
            actualSpendCostMicros: BigInt(0),
            activeDevelopers: 0,
            activeDeveloperIds: [],
            computedAt: now,
            sourceObservedThrough: null,
          })),
          skipDuplicates: true,
        });
        stubbed = missing.length;
      }

      const corruptDays = await findEmptyStubDaysWithUsage(orgId, fromDay, toDay, metricVersion);
      if (!corruptDays.length) return;

      alertSnapshotFailsafe(
        "analytics/snapshots_missing",
        orgId,
        new Error("org-day snapshots empty while usage_daily has data; rematerializing"),
        {
          from: isoDay(fromDay),
          to: isoDay(toDay),
          days: corruptDays.length,
          hadCoverage,
          stubbed,
        },
      );

      for (const range of collapseDaysToRanges(corruptDays)) {
        recovered += await materializeOrgUsageRange(orgId, range.from, range.to, metricVersion);
      }
    });
  } catch (error) {
    alertSnapshotFailsafe("analytics/snapshots_inaccessible", orgId, error, {
      from: isoDay(fromDay),
      to: isoDay(toDay),
    });
    try {
      await withOrgLock(orgId, async () => {
        recovered = await materializeOrgUsageRange(orgId, fromDay, toDay, metricVersion);
      });
    } catch (retryError) {
      alertSnapshotFailsafe("analytics/snapshots_recover_failed", orgId, retryError, {
        from: isoDay(fromDay),
        to: isoDay(toDay),
      });
      throw retryError;
    }
  }

  return { stubbed, hadCoverage, recovered };
}

/** Mark yesterday+today dirty for orgs that have recent usage (daily seal helper). */
export async function markActiveOrgsTodayDirty(
  options: { metricVersion?: string; lookbackDays?: number } = {},
): Promise<number> {
  const metricVersion = options.metricVersion ?? ORG_DAY_SNAPSHOT_VERSION;
  const lookbackDays = options.lookbackDays ?? 7;
  const today = utcDay(new Date());
  const since = new Date(today.getTime() - lookbackDays * 86_400_000);
  const yesterday = new Date(today.getTime() - 86_400_000);

  const orgs = await prisma.usageDaily.findMany({
    where: { date: { gte: since } },
    distinct: ["orgId"],
    select: { orgId: true },
    take: 500,
  });

  for (const row of orgs) {
    await markOrgUsageDaysDirty(row.orgId, [yesterday, today], metricVersion);
  }
  return orgs.length;
}

export { utcDay as snapshotUtcDay, isoDay as snapshotIsoDay, eachDayInclusive as snapshotEachDay };
