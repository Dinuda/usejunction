import { notFound, redirect } from "next/navigation";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { ToolProviderDetail } from "@/components/tools/tool-provider-detail";
import {
  cycleViewPeriodLabel,
  cycleViewShortSuffix,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { canonicalToolKey, findCatalogTool, subscriptionToolKeys } from "@/lib/tools/catalog";
import { serializeBigInts } from "@/lib/billing/validation";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function ToolProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ toolKey: string }>;
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, userId } = await requireWorkspaceRole(["owner", "admin"]);
  const [{ toolKey: rawToolKey }, query] = await Promise.all([params, searchParams]);
  const toolKey = canonicalToolKey(rawToolKey);
  if (toolKey !== rawToolKey && findCatalogTool(toolKey)) {
    const retained = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) retained.set(key, value);
    }
    const suffix = retained.size ? `?${retained.toString()}` : "";
    redirect(`/tools/${toolKey}${suffix}`);
  }
  const cycleView = parseCycleView(query.view);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: query.days,
    from: query.from,
    to: query.to,
  });
  const now = new Date();
  const subscriptions = await listSubscriptions(orgId);
  const templateKeys = subscriptionToolKeys(toolKey);
  const toolPlans = subscriptions.filter(
    (plan) => plan.toolKey != null && (templateKeys as readonly string[]).includes(plan.toolKey),
  );
  const reportWindow = reportWindowForCycleView(
    cycleView,
    rollingPeriod,
    toolPlans.length ? toolPlans : subscriptions,
    now,
  );
  const [detail, syncContext] = await Promise.all([
    getToolDetail(orgId, toolKey, reportWindow),
    getLocalSyncContext(orgId, userId),
  ]);
  if (!detail) notFound();

  const serialized = serializeBigInts(detail) as typeof detail & {
    plans: Array<
      (typeof detail.plans)[number] & {
        cycleSeatMicros: string;
        estimatedCycleMicros: string;
      }
    >;
  };

  return (
    <>
      {syncContext?.hasLocalEndpoint ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            stale={syncContext.stale}
          />
        </div>
      ) : null}
      <ToolProviderDetail
        data={serialized}
        cycleView={cycleView}
        period={rollingPeriod}
        periodLabel={cycleViewPeriodLabel(cycleView, rollingPeriod)}
        periodSuffix={cycleViewShortSuffix(cycleView, rollingPeriod)}
        periodBasePath={`/tools/${toolKey}`}
      />
    </>
  );
}
