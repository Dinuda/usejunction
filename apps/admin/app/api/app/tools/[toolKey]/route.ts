import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getLocalSyncPanelContext } from "@/lib/queries/me/local-sync-context";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canonicalToolKey, findCatalogTool, subscriptionToolKeys } from "@/lib/tools/catalog";

export async function GET(request: NextRequest, { params }: { params: Promise<{ toolKey: string }> }) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const rawToolKey = (await params).toolKey;
  const toolKey = canonicalToolKey(rawToolKey);
  if (!findCatalogTool(toolKey)) return appError("NOT_FOUND", "Tool not found.", 404);
  const query = request.nextUrl.searchParams;
  const cycleView = parseCycleView(query.get("view") ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: query.get("days") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
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
  if (!detail) return appError("NOT_FOUND", "Tool not found.", 404);
  const loaded = performance.now();
  return appData(
    { rawToolKey, toolKey, cycleView, rollingPeriod, detail, syncContext },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
