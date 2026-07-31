import { prisma } from "@usejunction/db";
import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getOrgDeviceSyncStatus } from "@/lib/queries/team/device-syncs";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type TeamSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function loadTeamPage(principal: AppPrincipal, search: TeamSearch = {}) {
  const { cycleView, rollingPeriod, now, subscriptions, reportWindow } =
    await loadTeamReportContext(principal, search);
  const hasDevicePromise = prisma.device
    .findFirst({ where: activeDevicesForOrg(principal.orgId), select: { id: true } })
    .then((row) => Boolean(row))
    .catch(() => false);
  const [hasDevice, roster] = await Promise.all([
    hasDevicePromise,
    getDeveloperRoster(principal.orgId, { reportWindow }),
  ]);

  return jsonSafe({
    cycleView,
    rollingPeriod,
    empty: !hasDevice,
    developers: roster.developers,
    subscriptions,
  });
}

export async function loadTeamUsagePage(principal: AppPrincipal, search: TeamSearch = {}) {
  const { now, subscriptions, reportWindow } = await loadTeamReportContext(principal, search);
  const planUsage = await getPlanUsage(
    { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now, timezone: UTC_TIMEZONE },
    { reportWindow },
    { subscriptions },
  );

  return jsonSafe({
    planUsage: planUsage.data.developers,
  });
}

async function loadTeamReportContext(principal: AppPrincipal, search: TeamSearch) {
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
  const now = new Date();
  const subscriptions = await listSubscriptions(principal.orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  return { cycleView, rollingPeriod, now, subscriptions, reportWindow };
}

export async function loadTeamInvitesPage(principal: AppPrincipal) {
  const [pendingInvitesRaw, developers] = await Promise.all([
    prisma.organizationInvite
      .findMany({
        where: {
          orgId: principal.orgId,
          acceptedAt: null,
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
      .catch(
        () =>
          [] as Array<{
            id: string;
            email: string;
            role: string;
            expiresAt: Date;
            createdAt: Date;
          }>,
      ),
    prisma.developer.findMany({
      where: { orgId: principal.orgId, removedAt: null },
      select: { email: true },
    }),
  ]);
  const rosterEmails = new Set(developers.map((developer) => developer.email.toLowerCase()));

  return jsonSafe({
    pendingInvites: pendingInvitesRaw.filter(
      (invite) => !rosterEmails.has(invite.email.toLowerCase()),
    ),
  });
}

export async function loadTeamSyncsPage(principal: AppPrincipal) {
  return jsonSafe({
    syncs: await getOrgDeviceSyncStatus(principal.orgId, new Date()),
  });
}
