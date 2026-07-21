import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { rematerializeOrgSnapshots } from "@/lib/analytics/snapshots";

/**
 * Manual Sync now completion: rematerialize dirty snapshot days for the active org
 * (including today/yesterday). Background ingest only marks dirty.
 */
export async function POST(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  try {
    const result = await rematerializeOrgSnapshots(principal.orgId, { includeToday: true });
    const loaded = performance.now();
    return appData(
      { ok: true as const, ...result },
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
