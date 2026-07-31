import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { parseCycleView, cycleViewWindows, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getRemoteSyncPanelContext } from "@/lib/sync/remote-sync-context";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canonicalToolKey, findCatalogTool, subscriptionToolKeys } from "@/lib/tools/catalog";
import { canSeeOrgOverview, isSelfScopedRole } from "@/lib/rbac/permissions";

export type ToolDetailSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export type ToolDetailAccess =
  | { ok: true; scope: "organization" }
  | { ok: true; scope: "personal"; developerId: string }
  | { ok: false; reason: "forbidden" | "not_linked" };

export async function resolveToolDetailAccess(principal: AppPrincipal): Promise<ToolDetailAccess> {
  if (canSeeOrgOverview(principal.role)) {
    return { ok: true, scope: "organization" };
  }
  if (!isSelfScopedRole(principal.role)) {
    return { ok: false, reason: "forbidden" };
  }
  const settings = await getOrgActivitySettings(principal.orgId);
  if (!settings.teamToolsBrowseEnabled) {
    return { ok: false, reason: "forbidden" };
  }
  const developerId = await resolveLinkedDeveloperId(principal.orgId, principal.userId);
  if (!developerId) {
    return { ok: false, reason: "not_linked" };
  }
  return { ok: true, scope: "personal", developerId };
}

export async function loadToolDetailPage(
  principal: AppPrincipal,
  rawToolKey: string,
  search: ToolDetailSearch = {},
) {
  const access = await resolveToolDetailAccess(principal);
  if (!access.ok) {
    return { error: access.reason } as const;
  }

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
  // Personal scope still uses org plan cycles when present so windows match admin billing cycles.
  const reportWindow = reportWindowForCycleView(
    cycleView,
    rollingPeriod,
    toolPlans.length ? toolPlans : subscriptions,
    new Date(),
  );
  const cycleWindows = cycleViewWindows(subscriptions);
  const [detail, syncContext] = await Promise.all([
    getToolDetail(principal.orgId, toolKey, reportWindow, {
      developerId: access.scope === "personal" ? access.developerId : undefined,
      subscriptions,
    }),
    getRemoteSyncPanelContext(principal.orgId, principal.userId, access.scope === "personal" ? "you" : "team"),
  ]);
  if (!detail) return null;
  return jsonSafe({
    kind: access.scope,
    rawToolKey,
    toolKey,
    cycleView,
    rollingPeriod,
    cycleWindows,
    detail,
    syncContext,
  });
}
