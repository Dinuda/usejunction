import { prisma } from "@usejunction/db";
import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type TeamSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function loadTeamPage(principal: AppPrincipal, search: TeamSearch = {}) {
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
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
  return jsonSafe({
    cycleView,
    rollingPeriod,
    empty: !hasDevice,
    developers: roster.developers,
    subscriptions,
    planUsage: planUsage.data.developers,
  });
}
