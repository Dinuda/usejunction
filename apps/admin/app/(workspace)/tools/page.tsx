import { SubscriptionInventory } from "@/components/tools/subscription-inventory";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { getMeOverview } from "@/lib/queries/me/overview";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function ToolsHeader({ personal = false }: { personal?: boolean }) {
  return (
    <div className="mb-10">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
        {personal ? "Your tools, in one place." : "Tools, seats, spend."}
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {personal
          ? "Tools detected on your connected computers, with live quota windows when available."
          : "Manage team subscriptions and compare purchased seats with detected activity and quotas."}
      </p>
    </div>
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
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={sync.lastSeenAt}
            lastUsageSyncAt={sync.lastUsageSyncAt}
            lastAccountSyncAt={sync.lastAccountSyncAt}
            stale={sync.stale}
            needsPlanSync={sync.needsPlanSync}
            autoAttempt
          />
        </div>
      ) : null}
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="border-l-2 border-primary/40 pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Detected tools</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{rows.length}</p>
          <p className="mt-2 text-xs text-muted-foreground">From your connected machines</p>
        </div>
        <div className="border-l-2 border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4 pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Assigned plans</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{data.developer.assignedPlans.length}</p>
          <p className="mt-2 text-xs text-muted-foreground">Available to you</p>
        </div>
      </div>
      <section className="mt-10">
        <div className="mb-4 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Your tools.</h2>
        </div>
        <div className="divide-y">
          {rows.length ? (
            rows.map((tool) => (
              <div key={tool.toolName} className="py-4">
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
                {tool.quotas.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tool.quotas.map((quota) => (
                      <span
                        key={`${quota.toolName}-${quota.windowType}`}
                        className="border bg-muted/40 px-2 py-1 font-mono text-[0.65rem] text-muted-foreground"
                      >
                        {quota.toolName} {quota.windowType}
                        {quota.usedPercent != null ? ` ${quota.usedPercent.toFixed(0)}%` : ""}
                        {quota.resetAt ? ` · resets ${new Date(quota.resetAt).toLocaleDateString()}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Connect a computer to detect your tools.</p>
          )}
        </div>
      </section>
    </>
  );
}

export default async function ToolsPage() {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  const syncContext = await getLocalSyncContext(orgId, userId);
  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    if (!syncContext) {
      return <PersonalTools data={personal} sync={{
        lastSeenAt: personal.sync.lastSeenAt,
        lastUsageSyncAt: personal.sync.lastUsageSyncAt,
        lastAccountSyncAt: personal.sync.lastAccountSyncAt,
        stale: personal.sync.stale,
        hasLocalEndpoint: personal.sync.hasLocalEndpoint,
        needsPlanSync: personal.sync.needsPlanSync,
      }} />;
    }
    return <PersonalTools data={personal} sync={syncContext} />;
  }
  let data: Awaited<ReturnType<typeof getDashboardTools>> | null = null;
  let err: string | null = null;

  try {
    data = await getDashboardTools(orgId);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load tools";
  }

  const defaultTab = data?.tools.some((tool) => (tool.quotas?.length ?? 0) > 0 || tool.installedOn > 0)
    ? "activity"
    : "subscriptions";

  return (
    <>
      <ToolsHeader />

      {syncContext?.hasLocalEndpoint ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            stale={syncContext.stale}
            needsPlanSync={syncContext.needsPlanSync}
            autoAttempt
          />
        </div>
      ) : null}

      {err && (
        <div className="mb-6 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <SubscriptionInventory detected={data} defaultTab={defaultTab} hasLocalSync={Boolean(syncContext?.hasLocalEndpoint)} />
    </>
  );
}
