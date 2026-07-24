/**
 * Mark dirty snapshot days and enqueue durable materialization.
 * Query results are always live SQL — no analytics_query_cache rows to delete.
 *
 * Inline rematerialize is opt-in for non-sync writers (legacy local-usage,
 * small dirty sets). The usage sync pipeline must pass `rematerialize: false`
 * on chunks — commit owns settle via settleSyncProjections / materializeOrgNow.
 */
import { prisma } from "@usejunction/db";
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

export { isoDay as invalidateIsoDay };
