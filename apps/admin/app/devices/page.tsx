import { Shell, PageHeader, Table, StatCard, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface DeviceRow {
  id: string;
  hostname: string;
  os: string;
  architecture: string;
  agentVersion: string;
  status: string;
  lastSeenAt: string;
  createdAt: string;
  totalRequests: number;
  user: { name: string; email: string } | null;
  toolInstallations: Array<{ toolName: string; detected: boolean; configured: boolean }>;
}

interface DevicesData {
  devices: DeviceRow[];
}

export default async function DevicesPage() {
  let data: DevicesData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<DevicesData>("/api/dashboard/devices");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load devices";
  }

  const online = data?.devices.filter((d) => d.status === "online").length ?? 0;

  return (
    <Shell active="/devices">
      <PageHeader title="Devices" description="Enrolled developer machines" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard label="Total Devices" value={data.devices.length} />
            <StatCard label="Online" value={online} sub="seen in last 5 min" />
            <StatCard label="Offline" value={data.devices.length - online} />
          </div>

          <Table
            headers={["Hostname", "Developer", "OS / Arch", "Agent", "Tools", "Requests", "Last Seen", "Status"]}
            rows={data.devices.map((d) => [
              <span key="h" className="font-mono text-xs">{d.hostname}</span>,
              d.user?.name ?? "—",
              <span key="os" className="text-xs text-zinc-500">{d.os} / {d.architecture}</span>,
              <span key="av" className="font-mono text-xs text-zinc-500">{d.agentVersion}</span>,
              <span key="t" className="text-xs">{d.toolInstallations.map((t) => t.toolName).join(", ") || "—"}</span>,
              d.totalRequests.toLocaleString(),
              new Date(d.lastSeenAt).toLocaleString(),
              <StatusBadge key="s" variant={d.status === "online" ? "success" : "default"}>{d.status}</StatusBadge>,
            ])}
          />
        </>
      )}
    </Shell>
  );
}
