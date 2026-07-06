import { Shell, PageHeader, Table } from "@/components/app-shell";
import { formatCost, formatNumber } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getTools() {
  return serverFetch("/api/dashboard/tools") ?? { tools: [] };
}

export default async function ToolsPage() {
  const { tools } = await getTools();

  return (
    <Shell active="/tools">
      <PageHeader title="Tools" description="Usage and configuration by AI coding tool" />
      <Table
        headers={["Tool", "Configured", "Detected", "Requests", "Cost", "Local Scan", "Avg Latency", "Errors"]}
        rows={tools.map((t: {
          toolName: string;
          usersConfigured: number;
          usersDetected: number;
          requests: number;
          cost: number;
          localScanCost: number;
          avgLatency: number;
          errors: number;
        }) => [
          t.toolName,
          t.usersConfigured,
          t.usersDetected,
          formatNumber(t.requests),
          formatCost(t.cost),
          formatCost(t.localScanCost),
          `${t.avgLatency}ms`,
          t.errors,
        ])}
      />
    </Shell>
  );
}
