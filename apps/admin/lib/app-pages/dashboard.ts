import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import {
  DEFAULT_ROLLING_PERIOD,
  parseRollingPeriodFromSearch,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getOrgOverview, overviewInputFromBounds, overviewInputFromRange } from "@/lib/insights";
import { listSubscriptions } from "@/lib/tools/subscriptions";

function overviewInputForView(cycleView: CycleView, period: RollingPeriod) {
  if (cycleView !== "last_30_days") return { cycleView };
  if (period.kind === "custom") return overviewInputFromBounds(period.from, period.to);
  return overviewInputFromRange(period.days, new Date());
}

export type DashboardSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
};

export async function loadDashboardPage(principal: AppPrincipal, search: DashboardSearch = {}) {
  const isDeveloper = principal.role === "user";
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const scope = canSwitchAudience ? parseAudienceScope(search.scope ?? null) : "team";

  const [settings, subscriptions] = await Promise.all([
    isDeveloper ? getOrgActivitySettings(principal.orgId) : Promise.resolve(null),
    listSubscriptions(principal.orgId),
  ]);
  const allowPeriodControls = !isDeveloper || Boolean(settings?.teamPeriodControlsEnabled);
  const cycleView = allowPeriodControls ? parseCycleView(search.view ?? undefined) : "last_30_days";
  const rollingPeriod: RollingPeriod = allowPeriodControls
    ? parseRollingPeriodFromSearch({
        days: search.days ?? undefined,
        from: search.from ?? undefined,
        to: search.to ?? undefined,
      })
    : DEFAULT_ROLLING_PERIOD;
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, new Date());
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);

  if (isDeveloper) {
    const personal = await getMeOverview(principal.orgId, principal.userId, principal.role, {
      reportWindow,
      cycleView,
    });
    return jsonSafe({
      kind: "personal" as const,
      scope: "you" as const,
      canSwitchAudience: false,
      allowPeriodControls,
      cycleView,
      rollingPeriod,
      periodLabel,
      personal,
    });
  }

  if (canSwitchAudience && scope === "you") {
    const [linkedId, syncContext] = await Promise.all([
      resolveLinkedDeveloperId(principal.orgId, principal.userId),
      getLocalSyncContext(principal.orgId, principal.userId),
    ]);
    const personal = linkedId
      ? await getMeOverview(principal.orgId, principal.userId, principal.role, {
          reportWindow,
          cycleView,
        })
      : null;
    return jsonSafe({
      kind: "personal" as const,
      scope: "you" as const,
      canSwitchAudience: true,
      youUnlinked: !linkedId,
      allowPeriodControls,
      cycleView,
      rollingPeriod,
      periodLabel,
      personal,
      needsPersonalConnect: !syncContext || syncContext.deviceCount === 0,
      syncContext,
    });
  }

  const [overviewResult, syncContext] = await Promise.all([
    getOrgOverview(
      {
        orgId: principal.orgId,
        actorId: principal.userId,
        roles: [principal.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      overviewInputForView(cycleView, rollingPeriod),
    )
      .then((envelope) => ({ data: envelope.data, error: null as string | null }))
      .catch(() => ({ data: null, error: "Could not load dashboard." })),
    getLocalSyncContext(principal.orgId, principal.userId),
  ]);

  return jsonSafe({
    kind: "organization" as const,
    scope: "team" as const,
    canSwitchAudience,
    cycleView,
    rollingPeriod,
    overview: overviewResult.data,
    error: overviewResult.error,
    needsPersonalConnect: !syncContext || syncContext.deviceCount === 0,
    syncContext,
  });
}
