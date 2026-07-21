import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { parseCycleView, type CycleView } from "@/lib/dashboard/cycle-view";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getOrgOverview, overviewInputFromBounds, overviewInputFromRange } from "@/lib/insights";

function overviewInputForView(cycleView: CycleView, period: RollingPeriod) {
  if (cycleView !== "last_30_days") return { cycleView };
  if (period.kind === "custom") return overviewInputFromBounds(period.from, period.to);
  return overviewInputFromRange(period.days, new Date());
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const query = request.nextUrl.searchParams;
  const cycleView = parseCycleView(query.get("view") ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: query.get("days") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  });

  if (principal.role === "user") {
    const personal = await getMeOverview(principal.orgId, principal.userId, principal.role);
    const loaded = performance.now();
    return appData(
      { kind: "personal" as const, personal },
      { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
    );
  }

  // Start all independent reads immediately; the old page waited for the
  // analytics model before beginning the developer and local-sync reads.
  const [overviewResult, myDeveloper, syncContext] = await Promise.all([
    getOrgOverview(
      {
        orgId: principal.orgId,
        actorId: principal.userId,
        roles: [principal.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      overviewInputForView(cycleView, rollingPeriod),
    ).then((envelope) => ({ data: envelope.data, error: null as string | null })).catch(() => ({ data: null, error: "Could not load dashboard." })),
    prisma.developer.findFirst({
      where: { orgId: principal.orgId, authUserId: principal.userId },
      select: { id: true, _count: { select: { devices: true } } },
    }),
    getLocalSyncContext(principal.orgId, principal.userId),
  ]);
  const loaded = performance.now();

  return appData(
    {
      kind: "organization" as const,
      cycleView,
      rollingPeriod,
      overview: overviewResult.data,
      error: overviewResult.error,
      needsPersonalConnect: !myDeveloper || myDeveloper._count.devices === 0,
      syncContext,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
