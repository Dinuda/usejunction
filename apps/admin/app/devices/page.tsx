import { Shell, PageHeader, StatusBadge, Table } from "@/components/app-shell";
import { timeAgo } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getDevices() {
  return serverFetch("/api/dashboard/devices") ?? { devices: [] };
}

export default async function DevicesPage() {
  const { devices } = await getDevices();

  return (
    <Shell active="/devices">
      <PageHeader title="Devices" description="Enrolled developer machines and agent health" />
      <Table
        headers={["Hostname", "User", "OS", "Agent", "Status", "Last Heartbeat", "Tools"]}
        rows={devices.map((d: {
          hostname: string;
          user: string;
          os: string;
          agentVersion: string;
          status: string;
          lastSeenAt: string;
          tools: Array<{ toolName: string; configured: boolean }>;
        }) => [
          d.hostname,
          d.user,
          d.os,
          d.agentVersion,
          <StatusBadge key="s" variant={d.status === "online" ? "success" : "default"}>{d.status}</StatusBadge>,
          timeAgo(d.lastSeenAt),
          d.tools.map((t) => t.toolName).join(", ") || "—",
        ])}
      />
    </Shell>
  );
}
