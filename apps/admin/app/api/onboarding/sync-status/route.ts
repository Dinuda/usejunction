import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceSyncReadiness } from "@/lib/analytics/snapshots/readiness";
import { materializeOrgNow } from "@/lib/analytics/snapshots/jobs";
import { SYNC_SETTLE_DEFERRED_BUDGET_MS } from "@/lib/sync/usage-sync";
import { timingHeader } from "@/lib/api/app-response";
import { prisma } from "@usejunction/db";
import { logServerError } from "@/lib/errors/public";

/** Hot window for onboarding readiness — older history may still be backfilling. */
const ONBOARDING_READY_WINDOW_DAYS = 14;

export const maxDuration = 300;

export async function GET() {
  const started = performance.now();
  const session = await auth();
  const sessionMs = performance.now();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  const [readiness, developer] = await Promise.all([
    getWorkspaceSyncReadiness(orgId, { windowDays: ONBOARDING_READY_WINDOW_DAYS }),
    prisma.developer.findFirst({
      where: { orgId, authUserId: session.user.id },
      select: {
        devices: {
          where: { decommissionedAt: null },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
          select: { lastUsageSyncAt: true },
        },
      },
    }),
  ]);
  const dataMs = performance.now();
  const lastUsageSyncAt = developer?.devices[0]?.lastUsageSyncAt ?? null;

  // Drive drain from the poll — Hobby cron is once/day only.
  // materializeOrgNow claim-guards so 2.5s polls cannot stampede.
  if (readiness.dirtyDayCount > 0) {
    after(async () => {
      try {
        // includeToday:false — avoid re-dirtying today on every poll.
        await materializeOrgNow(orgId, {
          includeToday: false,
          maxDurationMs: SYNC_SETTLE_DEFERRED_BUDGET_MS,
          entryPoint: "poll",
        });
      } catch (error) {
        logServerError("onboarding/sync-status-drain", error, { orgId });
      }
    });
  }

  return NextResponse.json(
    {
      dashboardReady: readiness.dashboardReady,
      dirtyDayCount: readiness.dirtyDayCount,
      snapshotLagSeconds: readiness.snapshotLagSeconds,
      lastUsageSyncAt: lastUsageSyncAt?.toISOString() ?? null,
    },
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        pragma: "no-cache",
        "server-timing": timingHeader({
          session: sessionMs - started,
          data: dataMs - sessionMs,
          total: dataMs - started,
        }),
      },
    },
  );
}
