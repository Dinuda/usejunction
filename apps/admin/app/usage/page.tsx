import { Shell, PageHeader, Table, StatCard } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface UsageData {
  byModel: Array<{ model: string | null; requests: number; tokens: number; cost: number }>;
  byTool: Array<{ toolName: string | null; requests: number; tokens: number; cost: number }>;
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  localUsage: Array<{ toolName: string; model: string | null; inputTokens: number; outputTokens: number; cost: number }>;
}

function fmt$(n: number) {
  return `$${n.toFixed(3)}`;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default async function UsagePage() {
  let data: UsageData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<UsageData>("/api/dashboard/usage?days=30");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load usage";
  }

  const totalCost = data?.byModel.reduce((s, m) => s + m.cost, 0) ?? 0;
  const totalTokens = data?.byModel.reduce((s, m) => s + m.tokens, 0) ?? 0;
  const totalRequests = data?.byModel.reduce((s, m) => s + m.requests, 0) ?? 0;

  return (
    <Shell active="/usage">
      <PageHeader title="Usage" description="Token and cost breakdown over the last 30 days" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard label="Total Requests (30d)" value={totalRequests.toLocaleString()} />
            <StatCard label="Total Tokens (30d)" value={fmtK(totalTokens)} />
            <StatCard label="Total Cost (30d)" value={fmt$(totalCost)} />
          </div>

          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">By model</h2>
            <Table
              headers={["Model", "Requests", "Tokens", "Cost"]}
              rows={data.byModel.map((m) => [
                <span key="n" className="font-mono text-xs">{m.model ?? "unknown"}</span>,
                m.requests.toLocaleString(),
                fmtK(m.tokens),
                fmt$(m.cost),
              ])}
            />
          </div>

          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">By tool</h2>
            <Table
              headers={["Tool", "Requests", "Tokens", "Cost"]}
              rows={data.byTool.map((t) => [
                t.toolName ?? "unknown",
                t.requests.toLocaleString(),
                fmtK(t.tokens),
                fmt$(t.cost),
              ])}
            />
          </div>

          {data.localUsage.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Local model usage (direct, bypassing gateway)</h2>
              <Table
                headers={["Tool", "Model", "Input Tokens", "Output Tokens", "Est. Cost"]}
                rows={data.localUsage.map((l) => [
                  l.toolName,
                  <span key="m" className="font-mono text-xs">{l.model ?? "—"}</span>,
                  fmtK(l.inputTokens),
                  fmtK(l.outputTokens),
                  fmt$(l.cost),
                ])}
              />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
