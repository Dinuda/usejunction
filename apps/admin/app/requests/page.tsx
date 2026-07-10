import { Shell, PageHeader, Table, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface RequestRow {
  id: string;
  toolName: string | null;
  provider: string | null;
  model: string | null;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  status: string;
  traceId: string | null;
  source: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  device: { hostname: string } | null;
}

interface RequestsData {
  requests: RequestRow[];
  nextCursor: string | null;
}

const LANGFUSE_URL = process.env.NEXT_PUBLIC_LANGFUSE_URL ?? "";

function statusVariant(s: string): "success" | "error" | "warning" | "default" {
  if (s === "success") return "success";
  if (s === "error" || s === "failed") return "error";
  if (s === "timeout" || s === "retry") return "warning";
  return "default";
}

function fmt$(n: number) {
  if (n < 0.001) return `<$0.001`;
  return `$${n.toFixed(3)}`;
}

export default async function RequestsPage() {
  let data: RequestsData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<RequestsData>("/api/dashboard/requests?limit=50");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load requests";
  }

  return (
    <Shell active="/requests">
      <PageHeader
        title="Requests"
        description="Gateway request metadata — no prompts stored"
      />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <Table
          headers={["Time", "Developer", "Tool", "Model", "Tokens", "Cost", "Latency", "Status", "Trace"]}
          rows={data.requests.map((r) => [
            new Date(r.createdAt).toLocaleString(),
            r.user ? `${r.user.name}` : "—",
            r.toolName ?? "—",
            r.model ?? "—",
            r.totalTokens.toLocaleString(),
            fmt$(r.estimatedCost),
            `${r.latencyMs}ms`,
            <StatusBadge key="s" variant={statusVariant(r.status)}>{r.status}</StatusBadge>,
            r.traceId && LANGFUSE_URL ? (
              <a
                key="t"
                href={`${LANGFUSE_URL}/trace/${r.traceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-cyan-400 underline-offset-2 hover:underline"
              >
                {r.traceId.slice(0, 8)}…
              </a>
            ) : (
              <span key="t" className="font-mono text-xs text-zinc-600">{r.traceId ? r.traceId.slice(0, 8) + "…" : "—"}</span>
            ),
          ])}
        />
      )}
    </Shell>
  );
}
