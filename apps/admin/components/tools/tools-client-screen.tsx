"use client";

import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubscriptionInventory } from "@/components/tools/subscription-inventory";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import {
  cycleViewShortSuffix,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import type { RollingPeriod } from "@/lib/dashboard/period-prefs";
import type { getDashboardTools } from "@/lib/queries/dashboard/tools";
import type { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import type { getMeOverview } from "@/lib/queries/me/overview";
import type { listSubscriptions } from "@/lib/tools/subscriptions";
import { serializeCatalog } from "@/lib/tools/catalog";
import { useAppQuery } from "@/lib/api/client";
import { toolsKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

const serializedCatalog = serializeCatalog();

function ToolsHeader({ personal = false }: { personal?: boolean }) {
  return (
    <PageHeader
      title={personal ? "Your tools, in one place." : "Tools, seats, spend."}
      description={
        personal
          ? "Tools detected on your connected computers, with live quota windows when available."
          : "Manage team subscriptions and compare purchased seats with usage and quotas."
      }
    />
  );
}

function PersonalTools({
  data,
  sync,
}: {
  data: Awaited<ReturnType<typeof getMeOverview>>;
  sync: NonNullable<Awaited<ReturnType<typeof getLocalSyncContext>>>;
}) {
  const tools = new Map<
    string,
    {
      toolName: string;
      devices: number;
      quotas: Array<{ toolName: string; windowType: string; usedPercent: number | null; resetAt: Date | null }>;
    }
  >();

  for (const device of data.developer.devices) {
    for (const tool of device.tools) {
      const existing = tools.get(tool.toolName) ?? { toolName: tool.toolName, devices: 0, quotas: [] };
      existing.devices += 1;
      tools.set(tool.toolName, existing);
    }
    for (const quota of device.quotas) {
      const existing = tools.get(quota.toolName) ?? { toolName: quota.toolName, devices: 0, quotas: [] };
      if (!existing.quotas.some((item) => item.windowType === quota.windowType)) {
        existing.quotas.push(quota);
      }
      tools.set(quota.toolName, existing);
    }
  }

  const rows = Array.from(tools.values()).sort((a, b) => a.toolName.localeCompare(b.toolName));

  return (
    <>
      <ToolsHeader personal />
      {sync.hasLocalEndpoint ? (
        <div className="mb-10">
          <LocalSyncPanel
            lastSeenAt={sync.lastSeenAt}
            lastUsageSyncAt={sync.lastUsageSyncAt}
            lastAccountSyncAt={sync.lastAccountSyncAt}
            dashboardReady={sync.dashboardReady}
            dirtyDayCount={sync.dirtyDayCount}
          />
        </div>
      ) : null}
      <div className="mb-10 grid items-start gap-y-8 sm:grid-cols-2">
        <SignalsKpi
          label="Detected tools"
          hero
          className="pl-5"
          value={rows.length}
          sub="From your connected device"
        />
        <SignalsKpi
          label="Assigned plans"
          className="sm:border-l sm:border-border sm:pl-8"
          value={data.developer.assignedPlans.length}
          sub="Available to you"
        />
      </div>
      <Panel as="section">
        <SignalsSectionHeader title="Your tools." bordered={false} />
        {rows.length ? (
          <ul>
            {rows.map((tool) => (
              <li key={tool.toolName} className="py-5 transition-colors hover:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ToolLogoTile tool={tool.toolName} size="sm" />
                    <div>
                      <p className="text-sm font-medium capitalize">{tool.toolName.replaceAll("-", " ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Detected on your device
                      </p>
                    </div>
                  </div>
                </div>
                {tool.quotas.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tool.quotas.map((quota) => (
                      <span
                        key={`${quota.toolName}-${quota.windowType}`}
                        className="font-mono text-[0.65rem] text-muted-foreground"
                      >
                        {quota.toolName} {quota.windowType}
                        {quota.usedPercent != null ? ` ${quota.usedPercent.toFixed(0)}%` : ""}
                        {quota.resetAt ? ` · resets ${new Date(quota.resetAt).toLocaleDateString()}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">Connect a computer to detect your tools.</p>
        )}
      </Panel>
    </>
  );
}

type ToolsPayload =
  | {
      kind: "personal";
      personal: Awaited<ReturnType<typeof getMeOverview>>;
      syncContext: Awaited<ReturnType<typeof getLocalSyncContext>>;
    }
  | {
      kind: "organization";
      cycleView: CycleView;
      rollingPeriod: RollingPeriod;
      detected: Awaited<ReturnType<typeof getDashboardTools>> | null;
      subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
      error: string | null;
      syncContext: Awaited<ReturnType<typeof getLocalSyncContext>>;
      defaultTab: "activity" | "subscriptions";
    };

export default function ToolsClientScreen() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const query = useAppQuery<ToolsPayload>(
    toolsKey(queryString),
    `/api/app/tools${queryString ? `?${queryString}` : ""}`,
  );
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;

  if (query.data.kind === "personal") {
    const { personal, syncContext } = query.data;
    if (!syncContext) {
      return (
        <PersonalTools
          data={personal}
          sync={{
            lastSeenAt: personal.sync.lastSeenAt,
            lastUsageSyncAt: personal.sync.lastUsageSyncAt,
            lastAccountSyncAt: personal.sync.lastAccountSyncAt,
            hasLocalEndpoint: personal.sync.hasLocalEndpoint,
            needsPlanSync: personal.sync.needsPlanSync,
            deviceCount: personal.developer.devices.length,
            dashboardReady: personal.sync.dashboardReady ?? true,
            dirtyDayCount: personal.sync.dirtyDayCount ?? 0,
            snapshotLagSeconds: personal.sync.snapshotLagSeconds ?? null,
          }}
        />
      );
    }
    return <PersonalTools data={personal} sync={syncContext} />;
  }
  const { cycleView, rollingPeriod, detected: data, error: err, syncContext, defaultTab } = query.data;
  const periodSuffix = cycleViewShortSuffix(cycleView, rollingPeriod);

  return (
    <>
      {err ? (
        <Alert variant="destructive" className="mb-6 rounded-none">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}

      <SubscriptionInventory
        detected={data}
        initialCatalog={serializedCatalog}
        initialSubscriptions={query.data.subscriptions}
        defaultTab={defaultTab}
        hasLocalSync={Boolean(syncContext?.hasLocalEndpoint)}
        cycleView={cycleView}
        period={rollingPeriod}
        periodSuffix={periodSuffix}
        periodBasePath="/tools"
      >
        {syncContext?.hasLocalEndpoint ? (
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            dashboardReady={syncContext.dashboardReady}
            dirtyDayCount={syncContext.dirtyDayCount}
          />
        ) : null}
      </SubscriptionInventory>
    </>
  );
}
