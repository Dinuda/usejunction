import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { cycleViewPeriodLabel, parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getWorkOverview } from "@/lib/signals";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type SignalsOverviewSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
  developerId?: string | null;
  teamId?: string | null;
  tool?: string | null;
};

export async function loadSignalsOverviewPage(principal: AppPrincipal, search: SignalsOverviewSearch = {}) {
  const scope = parseAudienceScope(search.scope ?? null);
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
  const now = new Date();
  const [subscriptions, policy] = await Promise.all([
    listSubscriptions(principal.orgId),
    getOrgSignalsPolicy(principal.orgId),
  ]);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);

  let developerId = scope === "team" ? (search.developerId || undefined) : undefined;
  let youUnlinked = false;
  if (scope === "you") {
    const linkedId = await resolveLinkedDeveloperId(principal.orgId, principal.userId);
    if (!linkedId) {
      youUnlinked = true;
    } else {
      developerId = linkedId;
    }
  }

  const envelope = youUnlinked
    ? null
    : await getWorkOverview(
        { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now, timezone: UTC_TIMEZONE },
        {
          from: reportWindow.from.toISOString().slice(0, 10),
          to: reportWindow.to.toISOString().slice(0, 10),
          developerId,
          teamId: scope === "team" ? (search.teamId || undefined) : undefined,
          tool: scope === "team" ? (search.tool || undefined) : undefined,
        },
        { policy },
      );

  return jsonSafe({
    scope,
    canSwitchAudience: true,
    youUnlinked,
    cycleView,
    rollingPeriod,
    periodLabel: cycleViewPeriodLabel(cycleView, rollingPeriod),
    work: envelope?.data ?? {
      enabled: false,
      sessions: 0,
      activePeople: 0,
      models: 0,
      trend: [],
      topTools: [],
      recent: [],
    },
  });
}
