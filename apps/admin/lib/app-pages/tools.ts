import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getLocalSyncPanelContext } from "@/lib/queries/me/local-sync-context";
import { getMeOverview } from "@/lib/queries/me/overview";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type ToolsSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function loadToolsPage(principal: AppPrincipal, search: ToolsSearch = {}) {
  if (principal.role === "user") {
    const [personal, syncContext] = await Promise.all([
      getMeOverview(principal.orgId, principal.userId, principal.role, { includeOrgPlanSync: false }),
      getLocalSyncPanelContext(principal.orgId, principal.userId),
    ]);
    return jsonSafe({ kind: "personal" as const, personal, syncContext });
  }

  const raw = {
    view: search.view ?? undefined,
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
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
  return jsonSafe({
    kind: "organization" as const,
    cycleView,
    rollingPeriod,
    detected: result.data,
    subscriptions,
    error: result.error,
    syncContext,
    defaultTab: Object.values(raw).some((value) => value != null) ? ("activity" as const) : ("subscriptions" as const),
  });
}
