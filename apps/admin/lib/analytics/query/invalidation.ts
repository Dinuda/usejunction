import { prisma } from "@usejunction/db";

export async function invalidateAnalyticsCache(orgId: string) {
  try {
    await prisma.analyticsQueryCache.deleteMany({ where: { orgId } });
  } catch (error) {
    console.error(JSON.stringify({ event: "analytics.cache_invalidation_failed", orgId, error }));
  }
}
