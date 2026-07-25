import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getWorkspaceSyncReadiness } from "@/lib/analytics/snapshots/readiness";
import { timingHeader } from "@/lib/api/app-response";
import { prisma } from "@usejunction/db";

export async function GET() {
  const started = performance.now();
  const session = await auth();
  const sessionMs = performance.now();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  const [readiness, developer] = await Promise.all([
    getWorkspaceSyncReadiness(orgId),
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
