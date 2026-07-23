/**
 * Mark dirty snapshot days and invalidate only query-cache rows whose window
 * overlaps those days. Always enqueues a durable materialization job.
 *
 * Inline rematerialize is opt-in for non-sync writers (legacy local-usage,
 * small dirty sets). The usage sync pipeline must pass `rematerialize: false`
 * on chunks — commit owns settle via settleSyncProjections / materializeOrgNow.
 */
import { Prisma, prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";
import {
  markOrgUsageDaysDirty,
  materializeDirtyOrgUsageDays,
  ORG_DAY_SNAPSHOT_VERSION,
} from "@/lib/analytics/snapshots";
import { enqueueMaterializationJob } from "@/lib/analytics/snapshots/jobs";

/** Inline rematerialize when dirty set is small enough to stay within ingest latency budget. */
export const INLINE_REMATERIALIZE_DIRTY_DAY_CAP = 7;

function isoDay(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

const rematerializeDebounce = new Map<string, number>();
const REMATERIALIZE_DEBOUNCE_MS = 5_000;

export async function invalidateAnalyticsCache(
  orgId: string,
  options: {
    dirtyDates?: Array<Date | string>;
    /**
     * true  — force inline rematerialize
     * false — never inline (dirty + enqueue only); used by sync chunks
     * omit  — auto: inline when dirty set is small or preferFirstSyncRematerialize
     */
    rematerialize?: boolean;
    /** Prefer rematerialize when org has no sealed non-stub snapshots yet. */
    preferFirstSyncRematerialize?: boolean;
  } = {},
): Promise<{ marked: string[]; rematerialized: boolean }> {
  const dirtyDates = options.dirtyDates?.length ? options.dirtyDates : [new Date()];
  const marked = await markOrgUsageDaysDirty(orgId, dirtyDates);
  if (!marked.length) return { marked: [] as string[], rematerialized: false };

  const minDirty = marked[0]!;
  const maxDirty = marked[marked.length - 1]!;
  await prisma.$executeRaw`
    DELETE FROM analytics_query_cache
    WHERE org_id = ${orgId}
      AND (normalized_query->'window'->>'from') IS NOT NULL
      AND (normalized_query->'window'->>'to') IS NOT NULL
      AND (normalized_query->'window'->>'from')::date <= ${maxDirty}::date
      AND (normalized_query->'window'->>'to')::date >= ${minDirty}::date
  `;

  await enqueueMaterializationJob(orgId);

  // Sync chunks pass rematerialize: false — commit settles projections once.
  if (options.rematerialize === false) {
    return { marked, rematerialized: false };
  }

  let shouldRematerialize = options.rematerialize === true;
  if (!shouldRematerialize && marked.length <= INLINE_REMATERIALIZE_DIRTY_DAY_CAP) {
    shouldRematerialize = true;
  }
  if (!shouldRematerialize && options.preferFirstSyncRematerialize) {
    const sealed = await prisma.orgUsageDaySnapshot.count({
      where: {
        orgId,
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        toolName: "",
        developerId: "",
        OR: [
          { requests: { gt: 0 } },
          { inputTokens: { gt: 0 } },
          { outputTokens: { gt: 0 } },
          { estimatedApiCostMicros: { gt: 0 } },
          { verifiedUsageCostMicros: { gt: 0 } },
          { sourceObservedThrough: { not: null } },
        ],
      },
      take: 1,
    });
    if (sealed === 0) shouldRematerialize = true;
  }

  if (shouldRematerialize && marked.length > 0) {
    const now = Date.now();
    const last = rematerializeDebounce.get(orgId) ?? 0;
    if (now - last >= REMATERIALIZE_DEBOUNCE_MS) {
      rematerializeDebounce.set(orgId, now);
      await materializeDirtyOrgUsageDays(orgId, {
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        limit: Math.max(marked.length, INLINE_REMATERIALIZE_DIRTY_DAY_CAP),
      });
      return { marked, rematerialized: true };
    }
  }

  return { marked, rematerialized: false };
}

/** Expire all analytics query caches whose TTL has passed (preferred over global wipe). */
export async function purgeAllExpiredAnalyticsCaches(now: Date = new Date()): Promise<number> {
  try {
    const result = await prisma.analyticsQueryCache.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  } catch (error) {
    logServerError("analytics/cache_purge_expired_all", error);
    return 0;
  }
}

/**
 * @deprecated Prefer purgeAllExpiredAnalyticsCaches — full wipe forces cold starts for all orgs.
 * Kept for calculation-version bumps that must invalidate every cached window.
 */
export async function invalidateAllAnalyticsCaches(): Promise<number> {
  try {
    const result = await prisma.analyticsQueryCache.deleteMany({});
    return result.count;
  } catch (error) {
    logServerError("analytics/cache_invalidation_all", error);
    return 0;
  }
}

/** Expire only this org's stale cache rows (hot-path housekeeping). */
export async function purgeExpiredAnalyticsCache(orgId: string, now: Date = new Date()) {
  try {
    await prisma.analyticsQueryCache.deleteMany({
      where: { orgId, expiresAt: { lte: now } },
    });
  } catch (error) {
    logServerError("analytics/cache_purge_expired", error, { orgId });
  }
}

export async function purgeExpiredAnalyticsCacheInTx(
  tx: Prisma.TransactionClient,
  orgId: string,
  now: Date,
) {
  await tx.analyticsQueryCache.deleteMany({
    where: { orgId, expiresAt: { lte: now } },
  });
}

export { isoDay as invalidateIsoDay };
