import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getLocalSyncPanelContext } from "@/lib/queries/me/local-sync-context";
import { getMeOverview } from "@/lib/queries/me/overview";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  if (principal.role === "user") {
    const [personal, syncContext] = await Promise.all([
      getMeOverview(principal.orgId, principal.userId, principal.role, { includeOrgPlanSync: false }),
      getLocalSyncPanelContext(principal.orgId, principal.userId),
    ]);
    const loaded = performance.now();
    return appData(
      { kind: "personal" as const, personal, syncContext },
      { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
    );
  }

  const query = request.nextUrl.searchParams;
  const raw = {
    view: query.get("view") ?? undefined,
    days: query.get("days") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  };
  const cycleView = parseCycleView(raw.view);
  const rollingPeriod = parseRollingPeriodFromSearch(raw);
  const subscriptionsPromise = listSubscriptions(principal.orgId);
  const syncPromise = getLocalSyncPanelContext(principal.orgId, principal.userId);
  const subscriptions = await subscriptionsPromise;
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, new Date());
  const [result, syncContext] = await Promise.all([
    getDashboardTools(principal.orgId, reportWindow)
      .then((data) => ({ data, error: null as string | null }))
      .catch(() => ({ data: null, error: "Failed to load tools." })),
    syncPromise,
  ]);
  const loaded = performance.now();
  return appData(
    {
      kind: "organization" as const,
      cycleView,
      rollingPeriod,
      detected: result.data,
      // The tools screen already needs subscriptions to render its default
      // tab. Returning this read here removes a second authenticated
      // subscriptions request from the browser.
      subscriptions,
      error: result.error,
      syncContext,
      defaultTab: Object.values(raw).some((value) => value != null) ? "activity" as const : "subscriptions" as const,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
