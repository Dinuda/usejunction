import { prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";

export async function invalidateAnalyticsCache(orgId: string) {
  try {
    await prisma.analyticsQueryCache.deleteMany({ where: { orgId } });
  } catch (error) {
    logServerError("analytics/cache_invalidation", error, { orgId });
  }
}
