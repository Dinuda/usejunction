import { NextRequest, NextResponse } from "next/server";
import { purgeAllExpiredAnalyticsCaches } from "@/lib/analytics/query";
import { logServerError } from "@/lib/errors/public";
import { setFullUsageRescanDay, utcDayString } from "@/lib/runtime-settings";
import {
  markActiveOrgsTodayDirty,
  materializeDirtyOrgUsageDays,
  ORG_DAY_SNAPSHOT_VERSION,
} from "@/lib/analytics/snapshots";
import { prisma } from "@usejunction/db";

function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (
    process.env.NODE_ENV === "production" &&
    secret === "development-cron" &&
    process.env.USEJUNCTION_ALLOW_INSECURE_DEVELOPMENT !== "true"
  ) {
    return NextResponse.json({ error: "a non-default CRON_SECRET is required" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret || "development-cron"}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Seals the UTC day for agent full usage rescans, marks active orgs' today/yesterday
 * dirty, rematerializes those snapshots, and refreshes analytics query caches.
 */
async function handle(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const day = utcDayString();
    await setFullUsageRescanDay(day);
    const orgsMarked = await markActiveOrgsTodayDirty({ metricVersion: ORG_DAY_SNAPSHOT_VERSION });

    const dirtyOrgs = await prisma.analyticsDirtyDay.findMany({
      where: { metricVersion: ORG_DAY_SNAPSHOT_VERSION },
      distinct: ["orgId"],
      select: { orgId: true },
      take: 200,
    });
    let snapshotDays = 0;
    for (const row of dirtyOrgs) {
      const result = await materializeDirtyOrgUsageDays(row.orgId, {
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        limit: 90,
      });
      snapshotDays += result.days;
    }

    const cachesInvalidated = await purgeAllExpiredAnalyticsCaches();
    return NextResponse.json({
      ok: true,
      day,
      orgsMarked,
      snapshotDays,
      cachesInvalidated,
    });
  } catch (error) {
    logServerError("cron/usage-daily-refresh", error);
    return NextResponse.json({ error: "usage daily refresh failed" }, { status: 500 });
  }
}

/** Vercel Cron invokes GET. */
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
