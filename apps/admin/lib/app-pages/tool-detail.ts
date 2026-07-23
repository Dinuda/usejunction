import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getLocalSyncPanelContext } from "@/lib/queries/me/local-sync-context";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canonicalToolKey, findCatalogTool, subscriptionToolKeys } from "@/lib/tools/catalog";

export type ToolDetailSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function loadToolDetailPage(
  principal: AppPrincipal,
  rawToolKey: string,
  search: ToolDetailSearch = {},
) {
  const toolKey = canonicalToolKey(rawToolKey);
  if (!findCatalogTool(toolKey)) return null;
  const cycleView = parseCycleView(search.view ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
  const subscriptions = await listSubscriptions(principal.orgId);
  const templateKeys = subscriptionToolKeys(toolKey);
  const toolPlans = subscriptions.filter(
    (plan) => plan.toolKey != null && (templateKeys as readonly string[]).includes(plan.toolKey),
  );
  const reportWindow = reportWindowForCycleView(
    cycleView,
    rollingPeriod,
    toolPlans.length ? toolPlans : subscriptions,
    new Date(),
  );
  const [detail, syncContext] = await Promise.all([
    getToolDetail(principal.orgId, toolKey, reportWindow),
    getLocalSyncPanelContext(principal.orgId, principal.userId),
  ]);
  if (!detail) return null;
  return jsonSafe({ rawToolKey, toolKey, cycleView, rollingPeriod, detail, syncContext });
}
