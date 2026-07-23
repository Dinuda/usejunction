import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { cycleViewPeriodLabel, parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { getDeviceActivityFeed } from "@/lib/queries/activity/device-activity";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type ActivitySearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: string | null;
};

export async function loadActivityPage(principal: AppPrincipal, search: ActivitySearch = {}) {
  const isDeveloper = principal.role === "user";
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const scope = canSwitchAudience ? parseAudienceScope(search.scope ?? null) : "team";
  const [settings, subscriptions] = await Promise.all([
    getOrgActivitySettings(principal.orgId),
    listSubscriptions(principal.orgId),
  ]);
  const allowPeriodControls = !isDeveloper || settings.teamPeriodControlsEnabled;
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
      allowPeriodControls,
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
        allowPeriodControls,
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
      allowPeriodControls,
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
    allowPeriodControls,
    cycleView,
    rollingPeriod,
    periodLabel,
    usage,
    deviceFeed,
  });
}
