import { prisma } from "@usejunction/db";
import { CALCULATION_VERSION, PRICING_VERSION } from "@/lib/metrics/source-priority";
import { LIVE_READ_HORIZON_DAYS } from "./overlay";

/** Keep in sync with ORG_DAY_SNAPSHOT_VERSION in materialize.ts (avoid circular imports). */
const DEFAULT_METRIC_VERSION = `org-day-snap-v1:${CALCULATION_VERSION}:${PRICING_VERSION}`;

function utcDay(date: Date | string): Date {
  if (typeof date === "string") return new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type DashboardReadiness = {
  /**
   * True when the visible (live-horizon) window does not depend on sealed
   * snapshots that conflict with usage. Dirty history backlog does not block.
   */
  dashboardReady: boolean;
  /** Dirty days outside the live-read horizon (history rematerialize backlog). */
  dirtyDayCount: number;
  stubConflictDayCount: number;
  /** Age in seconds of the oldest history dirty day; null when clean. */
  snapshotLagSeconds: number | null;
  oldestDirtyDay: string | null;
};

/**
 * Empty org-total stubs (zero metrics, no observed-through) that still have usage_daily.
 * Only checked outside the live-read horizon — recent days are served live.
 */
async function countStubConflicts(
  orgId: string,
  fromDay: Date,
  toDay: Date,
  metricVersion: string,
): Promise<number> {
  if (fromDay.getTime() > toDay.getTime()) return 0;
  const stubs = await prisma.orgUsageDaySnapshot.findMany({
    where: {
      orgId,
      metricVersion,
      toolName: "",
      developerId: "",
      date: { gte: fromDay, lte: toDay },
      sourceObservedThrough: null,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      verifiedUsageCostMicros: 0,
      estimatedApiCostMicros: 0,
      actualSpendCostMicros: 0,
    },
    select: { date: true },
  });
  if (!stubs.length) return 0;

  const days = stubs.map((row) => row.date);
  const usage = await prisma.usageDaily.findMany({
    where: {
      orgId,
      date: { in: days },
      OR: [
        { requests: { gt: 0 } },
        { inputTokens: { gt: 0 } },
        { outputTokens: { gt: 0 } },
        { costMicros: { gt: 0 } },
        { sessions: { gt: 0 } },
      ],
    },
    distinct: ["date"],
    select: { date: true },
  });
  return usage.length;
}

/**
 * Freshness contract for the visible dashboard window:
 * - Upload ready = device.lastUsageSyncAt (elsewhere)
 * - Dashboard ready = live-horizon KPIs do not depend on conflicting sealed stubs;
 *   history dirty backlog is reported separately and does not block readiness.
 */
export async function getDashboardReadiness(
  orgId: string,
  options: { from?: Date; to?: Date; metricVersion?: string } = {},
): Promise<DashboardReadiness> {
  const metricVersion = options.metricVersion ?? DEFAULT_METRIC_VERSION;
  const toDay = utcDay(options.to ?? new Date());
  const fromDay = utcDay(options.from ?? new Date(toDay.getTime() - 89 * 86_400_000));
  const liveHorizonStart = utcDay(new Date(toDay.getTime() - LIVE_READ_HORIZON_DAYS * 86_400_000));
  // History range ends the day before live horizon (exclusive of live window).
  const historyTo =
    liveHorizonStart.getTime() > fromDay.getTime()
      ? utcDay(new Date(liveHorizonStart.getTime() - 86_400_000))
      : null;
  const historyFrom = historyTo && historyTo.getTime() >= fromDay.getTime() ? fromDay : null;

  const [dirty, stubConflictDayCount] = await Promise.all([
    historyFrom && historyTo
      ? prisma.analyticsDirtyDay.findMany({
          where: {
            orgId,
            metricVersion,
            date: { gte: historyFrom, lte: historyTo },
          },
          orderBy: { date: "asc" },
          select: { date: true, createdAt: true },
        })
      : Promise.resolve([] as Array<{ date: Date; createdAt: Date }>),
    historyFrom && historyTo
      ? countStubConflicts(orgId, historyFrom, historyTo, metricVersion)
      : Promise.resolve(0),
  ]);

  // Live-horizon reads come from usage_daily, so dirty/stub history alone does not
  // block the recent dashboard — only history stub conflicts matter for "ready".
  if (stubConflictDayCount === 0) {
    const oldest = dirty[0];
    const lagMs = oldest ? Math.max(0, Date.now() - oldest.createdAt.getTime()) : null;
    return {
      dashboardReady: true,
      dirtyDayCount: dirty.length,
      stubConflictDayCount: 0,
      snapshotLagSeconds: lagMs == null ? null : Math.floor(lagMs / 1000),
      oldestDirtyDay: oldest ? isoDay(oldest.date) : null,
    };
  }

  const oldest = dirty[0];
  const lagMs = oldest ? Math.max(0, Date.now() - oldest.createdAt.getTime()) : null;
  return {
    dashboardReady: false,
    dirtyDayCount: dirty.length,
    stubConflictDayCount,
    snapshotLagSeconds: lagMs == null ? null : Math.floor(lagMs / 1000),
    oldestDirtyDay: oldest ? isoDay(oldest.date) : null,
  };
}

/** Count remaining dirty days for an org (full backlog, not window-scoped). */
export async function countOrgDirtyDays(
  orgId: string,
  metricVersion: string = DEFAULT_METRIC_VERSION,
): Promise<number> {
  return prisma.analyticsDirtyDay.count({
    where: { orgId, metricVersion },
  });
}
