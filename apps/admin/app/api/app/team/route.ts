import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;
  const query = request.nextUrl.searchParams;
  const cycleView = parseCycleView(query.get("view") ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: query.get("days") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  });
  const now = new Date();
  const subscriptionsPromise = listSubscriptions(principal.orgId);
  const hasDevicePromise = prisma.device
    .findFirst({ where: activeDevicesForOrg(principal.orgId), select: { id: true } })
    .then((row) => Boolean(row))
    .catch(() => false);
  const subscriptions = await subscriptionsPromise;
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  const [hasDevice, roster, planUsage] = await Promise.all([
    hasDevicePromise,
    getDeveloperRoster(principal.orgId, { reportWindow }),
    getPlanUsage(
      { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now, timezone: UTC_TIMEZONE },
      { reportWindow },
      { subscriptions },
    ),
  ]);
  const loaded = performance.now();
  return appData(
    {
      cycleView,
      rollingPeriod,
      empty: !hasDevice,
      developers: roster.developers,
      subscriptions,
      planUsage: planUsage.data.developers,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
