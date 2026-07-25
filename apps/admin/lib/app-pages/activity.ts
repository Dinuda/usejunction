import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { cycleViewPeriodLabel, parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getDeviceActivityFeed } from "@/lib/queries/activity/device-activity";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canManageSettings } from "@/lib/rbac/permissions";

export type ActivitySearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
};

export async function loadActivityPage(principal: AppPrincipal, search: ActivitySearch = {}) {
  const isDeveloper = principal.role === "user";
  const canSwitchAudience = canManageSettings(principal.role);
  const scope = canSwitchAudience ? parseAudienceScope(search.scope ?? null) : "team";
  const [settings, subscriptions] = await Promise.all([
    getOrgActivitySettings(principal.orgId),
    listSubscriptions(principal.orgId),
  ]);
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, new Date());
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);

  if (isDeveloper) {
    const [personal, signalsLedger] = await Promise.all([
      getMeOverview(principal.orgId, principal.userId, "user", { reportWindow }),
      getPersonalSignalsLedger(principal.orgId, principal.userId),
    ]);
    const deviceFeed = settings.teamDeviceActivityEnabled
      ? await getDeviceActivityFeed(principal.orgId, { developerId: personal.developer.id, limit: 50 })
      : { items: [], presenceFallback: false };
    return jsonSafe({
      kind: "personal" as const,
      scope: "you" as const,
      canSwitchAudience: false,
      settings,
      allowPeriodControls: true,
      cycleView,
      rollingPeriod,
      periodLabel,
      personal,
      signalsLedger,
      deviceFeed,
    });
  }

  if (canSwitchAudience && scope === "you") {
    const linkedId = await resolveLinkedDeveloperId(principal.orgId, principal.userId);
    if (!linkedId) {
      return jsonSafe({
        kind: "personal" as const,
        scope: "you" as const,
        canSwitchAudience: true,
        youUnlinked: true,
        settings,
        allowPeriodControls: true,
        cycleView,
        rollingPeriod,
        periodLabel,
        personal: null,
        signalsLedger: [],
        deviceFeed: { items: [], presenceFallback: false },
      });
    }
    const [personal, signalsLedger] = await Promise.all([
      getMeOverview(principal.orgId, principal.userId, principal.role, { reportWindow }),
      getPersonalSignalsLedger(principal.orgId, principal.userId),
    ]);
    const deviceFeed = settings.teamDeviceActivityEnabled
      ? await getDeviceActivityFeed(principal.orgId, { developerId: personal.developer.id, limit: 50 })
      : { items: [], presenceFallback: false };
    return jsonSafe({
      kind: "personal" as const,
      scope: "you" as const,
      canSwitchAudience: true,
      settings,
      allowPeriodControls: true,
      cycleView,
      rollingPeriod,
      periodLabel,
      personal,
      signalsLedger,
      deviceFeed,
    });
  }

  const [usage, deviceFeed] = await Promise.all([
    getDashboardUsage(principal.orgId, reportWindow),
    getDeviceActivityFeed(principal.orgId, { limit: 50 }),
  ]);
  return jsonSafe({
    kind: "organization" as const,
    scope: "team" as const,
    canSwitchAudience,
    allowPeriodControls: true,
    cycleView,
    rollingPeriod,
    periodLabel,
    usage,
    deviceFeed,
  });
}
