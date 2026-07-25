import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getLocalSyncContext, getLocalSyncPanelContext } from "@/lib/queries/me/local-sync-context";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import {
  getOrgOverview,
  getOrgOverviewMetrics,
  getOrgOverviewShell,
  overviewInputFromBounds,
  overviewInputFromRange,
} from "@/lib/insights";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { logServerError } from "@/lib/errors/public";
import { canManageSettings } from "@/lib/rbac/permissions";

function overviewInputForView(cycleView: CycleView, period: RollingPeriod) {
  if (cycleView !== "last_30_days") return { cycleView };
  if (period.kind === "custom") return overviewInputFromBounds(period.from, period.to);
  return overviewInputFromRange(period.days, new Date());
}

function insightContext(principal: AppPrincipal) {
  return {
    orgId: principal.orgId,
    actorId: principal.userId,
    roles: [principal.role],
    now: new Date(),
    timezone: UTC_TIMEZONE,
  };
}

export type DashboardSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
};

export type DashboardSlice = "full" | "shell" | "metrics";

export async function loadDashboardPage(
  principal: AppPrincipal,
  search: DashboardSearch = {},
  slice: DashboardSlice = "full",
) {
  const isDeveloper = principal.role === "user";
  const canSwitchAudience = canManageSettings(principal.role);
  const scope = canSwitchAudience ? parseAudienceScope(search.scope ?? null) : "team";

  const subscriptions = await listSubscriptions(principal.orgId);
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
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
      allowPeriodControls: true,
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
      allowPeriodControls: true,
      cycleView,
      rollingPeriod,
      periodLabel,
      personal,
      needsPersonalConnect: !syncContext || syncContext.deviceCount === 0,
      syncContext,
    });
  }

  const context = insightContext(principal);
  const overviewInput = overviewInputForView(cycleView, rollingPeriod);

  if (slice === "shell") {
    const [shell, syncPanel] = await Promise.all([
      getOrgOverviewShell(principal.orgId),
      getLocalSyncPanelContext(principal.orgId, principal.userId),
    ]);
    return jsonSafe({
      kind: "organization" as const,
      slice: "shell" as const,
      scope: "team" as const,
      canSwitchAudience,
      shell,
      needsPersonalConnect: !syncPanel || syncPanel.deviceCount === 0,
      syncPanel,
    });
  }

  if (slice === "metrics") {
    const overviewResult = await getOrgOverviewMetrics(context, overviewInput, {
      subscriptions,
    })
      .then((envelope) => ({ data: envelope.data, error: null as string | null }))
      .catch((error) => {
        logServerError("dashboard/overview", error);
        return { data: null, error: "Could not load dashboard." };
      });

    return jsonSafe({
      kind: "organization" as const,
      slice: "metrics" as const,
      scope: "team" as const,
      canSwitchAudience,
      cycleView,
      rollingPeriod,
      overview: overviewResult.data,
      error: overviewResult.error,
    });
  }

  const [overviewResult, syncPanel] = await Promise.all([
    getOrgOverview(context, overviewInput)
      .then((envelope) => ({ data: envelope.data, error: null as string | null }))
      .catch((error) => {
        logServerError("dashboard/overview", error);
        return { data: null, error: "Could not load dashboard." };
      }),
    getLocalSyncPanelContext(principal.orgId, principal.userId),
  ]);

  return jsonSafe({
    kind: "organization" as const,
    slice: "full" as const,
    scope: "team" as const,
    canSwitchAudience,
    cycleView,
    rollingPeriod,
    overview: overviewResult.data,
    error: overviewResult.error,
    needsPersonalConnect: !syncPanel || syncPanel.deviceCount === 0,
    syncPanel,
  });
}
