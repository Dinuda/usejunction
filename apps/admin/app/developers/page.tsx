import { Shell, PageHeader, StatusBadge, Table } from "@/components/app-shell";
import { formatCost, timeAgo } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getDevelopers() {
  return serverFetch("/api/dashboard/developers") ?? { developers: [] };
}

export default async function DevelopersPage() {
  const { developers } = await getDevelopers();

  return (
    <Shell active="/developers">
      <PageHeader title="Developers" description="Per-developer tool status, usage, and bypass flags" />
      <div className="space-y-4">
        {developers.length === 0 ? (
          <p className="text-zinc-500">No developers enrolled yet. Run the agent installer to enroll devices.</p>
        ) : (
          developers.map((d: {
            id: string;
            name: string;
            email: string;
            usageToday: number;
            localScanToday: number;
            bypassSuspect: boolean;
            mostUsedModel: string | null;
            lastSeen: string | null;
            devices: Array<{
              hostname: string;
              tools: Array<{ toolName: string; detected: boolean; configured: boolean }>;
              accounts: Array<{ toolName: string; email: string | null; plan: string | null; loginMethod: string }>;
              quotas: Array<{ windowType: string; usedPercent: number | null; resetAt: string | null }>;
            }>;
          }) => (
            <div key={d.id} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{d.name}</h3>
                  <p className="text-sm text-zinc-500">{d.email}</p>
                </div>
                <div className="flex gap-2">
                  {d.bypassSuspect && <StatusBadge variant="warning">Bypass suspect</StatusBadge>}
                  {d.lastSeen && (
                    <StatusBadge variant="default">Last seen {timeAgo(d.lastSeen)}</StatusBadge>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                <div>
                  <span className="text-zinc-500">Usage today:</span> {formatCost(d.usageToday)}
                </div>
                <div>
                  <span className="text-zinc-500">Local scan:</span> {formatCost(d.localScanToday)}
                </div>
                <div>
                  <span className="text-zinc-500">Top model:</span> {d.mostUsedModel || "—"}
                </div>
              </div>
              {d.devices.map((dev) => (
                <div key={dev.hostname} className="mt-4 border-t border-zinc-800 pt-4">
                  <div className="text-xs text-zinc-500 mb-2">{dev.hostname}</div>
                  <div className="flex flex-wrap gap-2">
                    {dev.tools.map((t) => (
                      <StatusBadge
                        key={t.toolName}
                        variant={t.configured ? "success" : t.detected ? "warning" : "default"}
                      >
                        {t.toolName}: {t.configured ? "configured" : t.detected ? "detected" : "—"}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Shell>
  );
}
