import { prisma } from "@usejunction/db";
import { CALCULATION_VERSION, PRICING_VERSION } from "@/lib/metrics/source-priority";

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
  /** True when no dirty days overlap the window and no empty stubs conflict with usage. */
  dashboardReady: boolean;
  dirtyDayCount: number;
  /** Age in seconds of the oldest dirty day overlapping the window; null when clean. */
  snapshotLagSeconds: number | null;
  oldestDirtyDay: string | null;
};

/**
 * Freshness contract for the visible dashboard window:
 * - Upload ready = device.lastUsageSyncAt (elsewhere)
 * - Dashboard ready = no dirty days in window
 */
export async function getDashboardReadiness(
  orgId: string,
  options: { from?: Date; to?: Date; metricVersion?: string } = {},
): Promise<DashboardReadiness> {
  const metricVersion = options.metricVersion ?? DEFAULT_METRIC_VERSION;
  const toDay = utcDay(options.to ?? new Date());
  const fromDay = utcDay(options.from ?? new Date(toDay.getTime() - 89 * 86_400_000));

  const dirty = await prisma.analyticsDirtyDay.findMany({
    where: {
      orgId,
      metricVersion,
      date: { gte: fromDay, lte: toDay },
    },
    orderBy: { date: "asc" },
    select: { date: true, createdAt: true },
  });

  if (!dirty.length) {
    return {
      dashboardReady: true,
      dirtyDayCount: 0,
      snapshotLagSeconds: null,
      oldestDirtyDay: null,
    };
  }

  const oldest = dirty[0]!;
  const lagMs = Math.max(0, Date.now() - oldest.createdAt.getTime());
  return {
    dashboardReady: false,
    dirtyDayCount: dirty.length,
    snapshotLagSeconds: Math.floor(lagMs / 1000),
    oldestDirtyDay: isoDay(oldest.date),
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
