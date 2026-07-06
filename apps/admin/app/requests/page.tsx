import { Shell, PageHeader, StatusBadge, Table } from "@/components/app-shell";
import { formatCost, formatNumber } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getRequests() {
  return serverFetch("/api/dashboard/requests") ?? { requests: [] };
}

export default async function RequestsPage() {
  const { requests } = await getRequests();

  return (
    <Shell active="/requests">
      <PageHeader title="Requests" description="Individual request log with Langfuse trace links" />
      <Table
        headers={["Time", "User", "Device", "Tool", "Model", "Tokens", "Cost", "Latency", "Status", "Trace"]}
        rows={requests.map((r: {
          timestamp: string;
          user: string;
          device: string;
          tool: string;
          model: string;
          inputTokens: number;
          outputTokens: number;
          cost: number;
          latency: number;
          status: string;
          traceLink: string | null;
        }) => [
          new Date(r.timestamp).toLocaleString(),
          r.user || "—",
          r.device || "—",
          r.tool || "—",
          r.model || "—",
          formatNumber(r.inputTokens + r.outputTokens),
          formatCost(r.cost),
          `${r.latency}ms`,
          <StatusBadge key="st" variant={r.status === "success" ? "success" : "error"}>{r.status}</StatusBadge>,
          r.traceLink ? (
            <a href={r.traceLink} target="_blank" rel="noopener" className="text-cyan-400 hover:underline">
              View
            </a>
          ) : (
            "—"
          ),
        ])}
      />
    </Shell>
  );
}
