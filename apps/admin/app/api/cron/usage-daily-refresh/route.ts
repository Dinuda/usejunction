import { NextRequest, NextResponse } from "next/server";
import { invalidateAllAnalyticsCaches } from "@/lib/analytics/query";
import { logServerError } from "@/lib/errors/public";
import { setFullUsageRescanDay, utcDayString } from "@/lib/runtime-settings";

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
 * Seals the UTC day for agent full usage rescans and refreshes dashboard caches.
 * Agents learn the day via heartbeat `fullUsageRescanDay` and run one full local
 * 60-day rescan, then return to incremental snapshots.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const day = utcDayString();
    await setFullUsageRescanDay(day);
    const cachesInvalidated = await invalidateAllAnalyticsCaches();
    return NextResponse.json({ ok: true, day, cachesInvalidated });
  } catch (error) {
    logServerError("cron/usage-daily-refresh", error);
    return NextResponse.json({ error: "usage daily refresh failed" }, { status: 500 });
  }
}
