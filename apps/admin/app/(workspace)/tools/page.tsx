import { SubscriptionInventory } from "@/components/tools/subscription-inventory";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import {
  cycleViewShortSuffix,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { getMeOverview } from "@/lib/queries/me/overview";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function ToolsHeader({ personal = false }: { personal?: boolean }) {
  return (
    <header className="mb-10 space-y-5">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
          {personal ? "Your tools, in one place." : "Tools, seats, spend."}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          {personal
            ? "Tools detected on your connected computers, with live quota windows when available."
            : "Manage team subscriptions and compare purchased seats with detected activity and quotas."}
        </p>
      </div>
    </header>
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
            stale={sync.stale}
          />
        </div>
      ) : null}
      <div className="mb-10 grid gap-y-8 sm:grid-cols-2">
        <SignalsKpi
          label="Detected tools"
          hero
          className="pl-5"
          value={rows.length}
          sub="From your connected machines"
        />
        <SignalsKpi
          label="Assigned plans"
          className="sm:border-l sm:border-border sm:pl-8"
          value={data.developer.assignedPlans.length}
          sub="Available to you"
        />
      </div>
      <section className="border bg-card p-5">
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
                        On {tool.devices} machine{tool.devices === 1 ? "" : "s"}
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
      </section>
    </>
  );
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  const syncContext = await getLocalSyncContext(orgId, userId);
  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    if (!syncContext) {
      return (
        <PersonalTools
          data={personal}
          sync={{
            lastSeenAt: personal.sync.lastSeenAt,
            lastUsageSyncAt: personal.sync.lastUsageSyncAt,
            lastAccountSyncAt: personal.sync.lastAccountSyncAt,
            stale: personal.sync.stale,
            hasLocalEndpoint: personal.sync.hasLocalEndpoint,
            needsPlanSync: personal.sync.needsPlanSync,
          }}
        />
      );
    }
    return <PersonalTools data={personal} sync={syncContext} />;
  }

  const params = await searchParams;
  const cycleView = parseCycleView(params.view);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: params.days,
    from: params.from,
    to: params.to,
  });
  const now = new Date();
  const subscriptions = await listSubscriptions(orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  const periodSuffix = cycleViewShortSuffix(cycleView, rollingPeriod);

  let data: Awaited<ReturnType<typeof getDashboardTools>> | null = null;
  let err: string | null = null;

  try {
    data = await getDashboardTools(orgId, reportWindow);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load tools";
  }

  const defaultTab = data?.tools.some((tool) => (tool.quotas?.length ?? 0) > 0 || tool.installedOn > 0)
    ? "activity"
    : "subscriptions";

  return (
    <>
      {err ? (
        <div className="mb-6 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>
      ) : null}

      <SubscriptionInventory
        detected={data}
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
            stale={syncContext.stale}
          />
        ) : null}
      </SubscriptionInventory>
    </>
  );
}
