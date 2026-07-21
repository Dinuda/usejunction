import { prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";

export async function invalidateAnalyticsCache(orgId: string) {
  try {
    await prisma.analyticsQueryCache.deleteMany({ where: { orgId } });
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
