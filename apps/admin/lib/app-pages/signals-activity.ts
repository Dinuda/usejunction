import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { parseCycleView, cycleViewWindows, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getWorkActivity, readSignalsFilterOptions } from "@/lib/signals";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canSeeOrgOverview } from "@/lib/rbac/permissions";

export type SignalsActivitySearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
  developerId?: string | null;
  tool?: string | null;
};

export async function loadSignalsActivityPage(principal: AppPrincipal, search: SignalsActivitySearch = {}) {
  const scope = parseAudienceScope(search.scope ?? null);
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
  const now = new Date();
  const [subscriptions, options] = await Promise.all([
    listSubscriptions(principal.orgId),
    readSignalsFilterOptions(principal.orgId),
  ]);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  const cycleWindows = cycleViewWindows(subscriptions, now);

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

  const tool = search.tool || undefined;

  const envelope = youUnlinked
    ? null
    : await getWorkActivity(
        { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now, timezone: UTC_TIMEZONE },
        {
          from: reportWindow.from.toISOString().slice(0, 10),
          to: reportWindow.to.toISOString().slice(0, 10),
          developerId,
          tool,
          limit: 100,
        },
      );

  return jsonSafe({
    scope,
    canSwitchAudience: canSeeOrgOverview(principal.role),
    youUnlinked,
    cycleView,
    rollingPeriod,
    cycleWindows,
    developerId,
    tool,
    options,
    work: envelope?.data ?? { enabled: false, sessions: [] },
  });
}
