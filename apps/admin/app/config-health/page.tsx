import { Shell, PageHeader, StatusBadge } from "@/components/app-shell";
import { timeAgo } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getConfigHealth() {
  return serverFetch("/api/dashboard/config-health");
}

export default async function ConfigHealthPage() {
  const data = await getConfigHealth();

  return (
    <Shell active="/config-health">
      <PageHeader
        title="Config Health"
        description="Installation coverage, misconfigurations, and bypass suspects"
      />
      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-xs text-zinc-500">Enrolled devices</div>
              <div className="text-2xl font-semibold">{data.enrolled}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-xs text-zinc-500">Tools detected</div>
              <div className="text-2xl font-semibold">{data.detected}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-xs text-zinc-500">Tools configured</div>
              <div className="text-2xl font-semibold">{data.configured}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 p-4">
              <div className="text-xs text-zinc-500">Not installed</div>
              <div className="text-2xl font-semibold">{data.notInstalled.length}</div>
            </div>
          </div>

          {data.bypassSuspects.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-amber-400">Bypass suspects</h2>
              <div className="space-y-2">
                {data.bypassSuspects.map((b: { user: string; tool: string; localCost: number; gatewayCost: number; deltaPercent: number }, i: number) => (
                  <div key={i} className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
                    <strong>{b.user}</strong> — {b.tool}: local ${b.localCost.toFixed(2)} vs gateway $
                    {b.gatewayCost.toFixed(2)} (+{b.deltaPercent}%)
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.misconfigured.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Misconfigured tools</h2>
              <div className="flex flex-wrap gap-2">
                {data.misconfigured.map((t: { toolName: string; deviceId: string }, i: number) => (
                  <StatusBadge key={i} variant="warning">{t.toolName}</StatusBadge>
                ))}
              </div>
            </section>
          )}

          {data.offlineDevices.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Offline devices</h2>
              {data.offlineDevices.map((d: { hostname: string; lastSeenAt: string }, i: number) => (
                <div key={i} className="text-sm text-zinc-400">
                  {d.hostname} — last seen {timeAgo(d.lastSeenAt)}
                </div>
              ))}
            </section>
          )}

          {data.notInstalled.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Users without agent</h2>
              {data.notInstalled.map((u: { name: string; email: string }, i: number) => (
                <div key={i} className="text-sm">{u.name} ({u.email})</div>
              ))}
            </section>
          )}
        </div>
      ) : (
        <p className="text-zinc-500">Unable to load config health data.</p>
      )}
    </Shell>
  );
}
