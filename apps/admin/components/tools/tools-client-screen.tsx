"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
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
import { canonicalToolKey, serializeCatalog, toolDisplayName } from "@/lib/tools/catalog";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppPageQuery } from "@/lib/api/client";
import { toolsKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

const serializedCatalog = serializeCatalog();

type PersonalToolRow = {
  toolName: string;
  toolKey: string;
  devices: number;
  requests: number;
  tokens: number;
  cost: number;
  planLabel: string | null;
  primaryQuota: {
    windowType: string;
    usedPercent: number | null;
    resetAt: Date | null;
  } | null;
  quotas: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    resetAt: Date | null;
  }>;
};

function planLabelForTool(
  toolName: string,
  seats: Awaited<ReturnType<typeof getMeOverview>>["developer"]["vendorSeats"],
  accounts: Array<{ toolName: string; plan: string | null }>,
) {
  const key = canonicalToolKey(toolName) || toolName;
  const account = accounts.find((row) => (canonicalToolKey(row.toolName) || row.toolName) === key && row.plan);
  if (account?.plan) return account.plan;
  const seat = seats.find((row) => {
    const productKey = canonicalToolKey(row.product) || row.product;
    return productKey === key && row.plan;
  });
  return seat?.plan ?? null;
}

function buildPersonalToolRows(data: Awaited<ReturnType<typeof getMeOverview>>): PersonalToolRow[] {
  const tools = new Map<string, PersonalToolRow>();
  const usageByKey = new Map(
    data.toolsUsage30d.map((row) => [canonicalToolKey(row.toolName) || row.toolName, row]),
  );
  const accounts = data.developer.devices.flatMap((device) => device.accounts);

  function ensure(toolName: string) {
    const toolKey = canonicalToolKey(toolName) || toolName;
    const existing = tools.get(toolKey);
    if (existing) return existing;
    const usage = usageByKey.get(toolKey);
    const next: PersonalToolRow = {
      toolName,
      toolKey,
      devices: 0,
      requests: usage?.requests ?? 0,
      tokens: usage?.tokens ?? 0,
      cost: usage?.cost ?? 0,
      planLabel: planLabelForTool(toolName, data.developer.vendorSeats, accounts),
      primaryQuota: null,
      quotas: [],
    };
    tools.set(toolKey, next);
    return next;
  }

  for (const device of data.developer.devices) {
    for (const tool of device.tools) {
      ensure(tool.toolName).devices += 1;
    }
    for (const quota of device.quotas) {
      const row = ensure(quota.toolName);
      if (!row.quotas.some((item) => item.windowType === quota.windowType)) {
        row.quotas.push(quota);
      }
    }
  }

  for (const usage of data.toolsUsage30d) {
    ensure(usage.toolName);
  }

  for (const row of tools.values()) {
    const ranked = [...row.quotas].sort((a, b) => (b.usedPercent ?? -1) - (a.usedPercent ?? -1));
    row.primaryQuota = ranked[0]
      ? {
          windowType: ranked[0].windowType,
          usedPercent: ranked[0].usedPercent,
          resetAt: ranked[0].resetAt,
        }
      : null;
  }

  return Array.from(tools.values()).sort((a, b) => {
    if (b.requests !== a.requests) return b.requests - a.requests;
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return toolDisplayName(a.toolName).localeCompare(toolDisplayName(b.toolName));
  });
}

function PersonalTools({
  data,
  sync,
  canBrowseTools,
}: {
  data: Awaited<ReturnType<typeof getMeOverview>>;
  sync: NonNullable<Awaited<ReturnType<typeof getLocalSyncContext>>>;
  canBrowseTools: boolean;
}) {
  const rows = useMemo(() => buildPersonalToolRows(data), [data]);
  const rangeDays = data.observation.rangeDays;
  const mostActive = data.toolsUsage30d[0] ?? null;
  const usageCost = data.kpis.verifiedUsageCost + data.kpis.estimatedApiCost;

  return (
    <>
      <PageHeader
        title="Your tools, usage, spend."
        description="Tools on your connected computers, with your requests, tokens, and live quota windows."
      >
        {sync.hasLocalEndpoint ? (
          <LocalSyncPanel
            lastSeenAt={sync.lastSeenAt}
            lastUsageSyncAt={sync.lastUsageSyncAt}
            lastAccountSyncAt={sync.lastAccountSyncAt}
            dashboardReady={sync.dashboardReady}
            dirtyDayCount={sync.dirtyDayCount}
          />
        ) : null}
      </PageHeader>

      <div className="space-y-10">
        <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
          <SignalsKpi
            label="Active tools"
            hero
            className="pl-5"
            value={rows.length}
            sub="Detected on your devices"
          />
          <SignalsKpi
            label="Total tokens"
            className="sm:border-l sm:border-border sm:pl-8"
            value={formatCompactNumber(data.kpis.tokens)}
            sub={`Last ${rangeDays} days`}
          />
          <SignalsKpi
            label="Most active tool"
            className="xl:border-l xl:border-border xl:pl-8"
            value={mostActive ? toolDisplayName(mostActive.toolName) : "—"}
            sub={
              mostActive
                ? `${formatCompactNumber(mostActive.requests)} requests · ${rangeDays}d`
                : "No usage yet"
            }
          />
          <SignalsKpi
            label="Your plan cost"
            className="sm:border-l sm:border-border sm:pl-8"
            value={formatUsd(data.kpis.subscriptionCommitment)}
            sub={
              usageCost > 0
                ? `${formatUsd(usageCost)} usage · ${rangeDays}d`
                : `${data.developer.vendorSeats.length} assigned plans`
            }
          />
        </div>

        <Panel as="section">
          <SignalsSectionHeader
            title="Your tools."
            description="Plans and quotas available to you, with your recent usage."
            bordered
          />
          {rows.length ? (
            <ul>
              {rows.map((tool) => {
                const summaryParts = [
                  tool.planLabel ? tool.planLabel : null,
                  tool.devices > 0
                    ? `Detected on ${tool.devices} device${tool.devices === 1 ? "" : "s"}`
                    : "Seen in your usage",
                ].filter(Boolean);
                const body = (
                  <>
                    <div className="flex min-w-0 items-center gap-3">
                      <ToolLogoTile tool={tool.toolKey} size="lg" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight">
                          {toolDisplayName(tool.toolName)}
                        </h3>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {summaryParts.join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm tabular-nums">
                      <div>
                        <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Requests
                        </span>
                        {formatCompactNumber(tool.requests)}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Tokens
                        </span>
                        {formatCompactNumber(tool.tokens)}
                      </div>
                      <div>
                        <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Plan use
                        </span>
                        {tool.primaryQuota?.usedPercent != null
                          ? `${tool.primaryQuota.usedPercent.toFixed(0)}%`
                          : tool.cost > 0
                            ? formatUsd(tool.cost)
                            : "—"}
                      </div>
                    </div>
                    {canBrowseTools ? (
                      <span
                        aria-hidden
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "rounded-none justify-self-start pointer-events-none md:justify-self-end",
                        )}
                      >
                        Open
                        <ChevronRight />
                      </span>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                  </>
                );

                return (
                  <li key={tool.toolKey}>
                    {canBrowseTools ? (
                      <Link
                        href={`/tools/${tool.toolKey}`}
                        className="group grid w-full gap-5 py-5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/40 md:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)_auto] md:items-center"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="grid w-full gap-5 py-5 md:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)_auto] md:items-center">
                        {body}
                      </div>
                    )}
                    {tool.quotas.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pb-5 md:pl-[calc(2.75rem+0.75rem)]">
                        {tool.quotas.map((quota) => (
                          <span
                            key={`${quota.toolName}-${quota.windowType}`}
                            className="font-mono text-[0.65rem] text-muted-foreground"
                          >
                            {quota.windowType}
                            {quota.usedPercent != null ? ` ${quota.usedPercent.toFixed(0)}%` : ""}
                            {quota.resetAt
                              ? ` · resets ${new Date(quota.resetAt).toLocaleDateString()}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              Connect a computer to detect your tools.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

type ToolsPayload =
  | {
      kind: "personal";
      personal: Awaited<ReturnType<typeof getMeOverview>>;
      syncContext: Awaited<ReturnType<typeof getLocalSyncContext>>;
      canBrowseTools: boolean;
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
  const query = useAppPageQuery<ToolsPayload>(
    toolsKey(queryString),
    `/api/app/tools${queryString ? `?${queryString}` : ""}`,
  );
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;

  if (query.data.kind === "personal") {
    const { personal, syncContext, canBrowseTools } = query.data;
    if (!syncContext) {
      return (
        <PersonalTools
          data={personal}
          canBrowseTools={Boolean(canBrowseTools)}
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
    return <PersonalTools data={personal} sync={syncContext} canBrowseTools={Boolean(canBrowseTools)} />;
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
