import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/app-shell";
import { ToolBrandLabel } from "@/components/tools/tool-brand-icon";
import { compact, loadMemberMetrics, money } from "@/lib/developers/member-page-context";

function relativeTime(date: Date | string | null | undefined) {
  if (!date) return null;
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return null;
  const ms = Date.now() - value.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function MemberFleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { developerId } = await params;
  const paramsValue = await searchParams;
  const { personal, selectedPeriodLabel } = await loadMemberMetrics(developerId, paramsValue);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Fleet.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Machines reporting into this workspace, plus tool traffic for {selectedPeriodLabel}.
          </p>
        </div>
        <Link
          href={`/signals/activity?developerId=${encodeURIComponent(developerId)}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Open in Signals
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <div className="mb-4">
            <h3 className="text-sm font-semibold tracking-tight">Machines</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Agent version and last sync when available.
              {personal.sync.stale ? " · reporting looks stale" : ""}
            </p>
          </div>
          {personal.developer.devices.length ? (
            <ul>
              {personal.developer.devices.map((device) => {
                const lastSeen = relativeTime(device.lastSeenAt);
                const lastSync = relativeTime(device.lastUsageSyncAt);
                return (
                  <li key={device.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.hostname}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {device.os}
                        {device.architecture ? ` · ${device.architecture}` : ""}
                        {" · "}
                        {device.tools.length} {device.tools.length === 1 ? "tool" : "tools"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Agent {device.agentVersion || "—"}
                        {lastSeen ? ` · seen ${lastSeen}` : ""}
                        {lastSync ? ` · usage sync ${lastSync}` : ""}
                      </p>
                    </div>
                    <StatusBadge variant={device.status === "online" ? "success" : "default"}>
                      {device.status}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No machines enrolled yet.</p>
          )}
        </section>

        <section>
          <div className="mb-4">
            <h3 className="text-sm font-semibold tracking-tight">By tool</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Detected on their machines · {selectedPeriodLabel}.
            </p>
          </div>
          {personal.toolsUsage30d.length ? (
            <ul>
              {personal.toolsUsage30d.map((tool) => (
                <li key={tool.toolName} className="flex items-center justify-between gap-3 py-4">
                  <ToolBrandLabel
                    tool={tool.toolName}
                    light
                    subtitle={
                      [
                        tool.tokens > 0 ? `${compact(tool.tokens)} tokens` : "Detected",
                        tool.cost > 0 ? money(tool.cost) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  />
                  <p className="text-sm font-medium tabular-nums">{compact(tool.requests)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No tools detected yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
