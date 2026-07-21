import { Prisma, prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";
import { markOrgUsageDaysDirty, materializeDirtyOrgUsageDays, ORG_DAY_SNAPSHOT_VERSION } from "@/lib/analytics/snapshots";

function isoDay(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * Mark dirty snapshot days and invalidate only query-cache rows whose window
 * overlaps those days. Rematerialize is opt-in (Sync now / cron) — default is
 * dirty-only so background ingest does not block on CTEs.
 */
export async function invalidateAnalyticsCache(
  orgId: string,
  options: { dirtyDates?: Array<Date | string>; rematerialize?: boolean } = {},
) {
  try {
    const dirtyDates = options.dirtyDates?.length
      ? options.dirtyDates
      : [new Date()];
    const marked = await markOrgUsageDaysDirty(orgId, dirtyDates);
    const minDirty = marked[0] ?? isoDay(new Date());

    await prisma.$executeRaw`
      DELETE FROM analytics_query_cache
      WHERE org_id = ${orgId}
        AND (normalized_query->'window'->>'to') IS NOT NULL
        AND (normalized_query->'window'->>'to')::date >= ${minDirty}::date
    `;

    if (options.rematerialize === true && marked.length > 0) {
      await materializeDirtyOrgUsageDays(orgId, {
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        limit: 90,
      });
    }
  } catch (error) {
    logServerError("analytics/cache_invalidation", error, { orgId });
  }
}

/** Wipe analytics query caches for every org (daily usage seal). */
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
