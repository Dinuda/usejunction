import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { getDashboardReadiness, rematerializeOrgSnapshots } from "@/lib/analytics/snapshots";

/** Allow Sync now to clear large dirty backlogs without hitting the default 10s limit. */
export const maxDuration = 60;

/**
 * Manual Sync now completion: rematerialize leftover dirty days for the active org.
 * Primary settle is usage sync commit (settleSyncProjections); this covers browser
 * Sync now and any backlog that commit could not finish.
 */
export async function POST(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  try {
    const result = await rematerializeOrgSnapshots(principal.orgId, { includeToday: true });
    const readiness = await getDashboardReadiness(principal.orgId);
    const loaded = performance.now();
    return appData(
      {
        ok: true as const,
        dirtyDays: result.dirtyDays,
        rows: result.rows,
        dirtyRemaining: result.dirtyRemaining,
        dashboardReady: readiness.dashboardReady,
      },
      {
        serverTiming: timingHeader({
          auth: authenticated - started,
          data: loaded - authenticated,
          total: loaded - started,
        }),
      },
    );
  } catch (error) {
    return appError(
      "SNAPSHOT_REFRESH_FAILED",
      error instanceof Error ? error.message : "Could not refresh snapshots.",
      500,
    );
  }
}
