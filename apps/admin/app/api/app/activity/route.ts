import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { cycleViewPeriodLabel, parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { getDeviceActivityFeed } from "@/lib/queries/activity/device-activity";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;
  const isDeveloper = principal.role === "user";
  const query = request.nextUrl.searchParams;
  const [settings, subscriptions] = await Promise.all([
    getOrgActivitySettings(principal.orgId),
    listSubscriptions(principal.orgId),
  ]);
  const allowPeriodControls = !isDeveloper || settings.teamPeriodControlsEnabled;
  const cycleView = allowPeriodControls ? parseCycleView(query.get("view") ?? undefined) : "last_30_days";
  const rollingPeriod: RollingPeriod = allowPeriodControls
    ? parseRollingPeriodFromSearch({ days: query.get("days") ?? undefined, from: query.get("from") ?? undefined, to: query.get("to") ?? undefined })
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
    const loaded = performance.now();
    return appData(
      { kind: "personal" as const, settings, allowPeriodControls, cycleView, rollingPeriod, periodLabel, personal, signalsLedger, deviceFeed },
      { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
    );
  }

  const [usage, deviceFeed] = await Promise.all([
    getDashboardUsage(principal.orgId, reportWindow),
    getDeviceActivityFeed(principal.orgId, { limit: 50 }),
  ]);
  const loaded = performance.now();
  return appData(
    { kind: "organization" as const, allowPeriodControls, cycleView, rollingPeriod, periodLabel, usage, deviceFeed },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
