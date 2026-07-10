import { Shell, PageHeader, Table, StatCard } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface ToolRow {
  toolName: string;
  installedOn: number;
  configuredOn: number;
  requests7d: number;
  cost7d: number;
  tokens7d: number;
}

interface ToolsData {
  tools: ToolRow[];
}

function fmt$(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function ToolsPage() {
  let data: ToolsData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<ToolsData>("/api/dashboard/tools");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load tools";
  }

  const totalReqs = data?.tools.reduce((s, t) => s + t.requests7d, 0) ?? 0;
  const totalCost = data?.tools.reduce((s, t) => s + t.cost7d, 0) ?? 0;

  return (
    <Shell active="/tools">
      <PageHeader title="Tools" description="AI coding tools detected across devices" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard label="Tools Tracked" value={data.tools.length} />
            <StatCard label="Requests (7d)" value={totalReqs.toLocaleString()} />
            <StatCard label="Cost (7d)" value={fmt$(totalCost)} />
          </div>

          <Table
            headers={["Tool", "Installed On", "Configured", "Requests (7d)", "Tokens (7d)", "Cost (7d)"]}
            rows={data.tools.map((t) => [
              <span key="n" className="font-medium">{t.toolName}</span>,
              `${t.installedOn} devices`,
              `${t.configuredOn} / ${t.installedOn}`,
              t.requests7d.toLocaleString(),
              t.tokens7d.toLocaleString(),
              fmt$(t.cost7d),
            ])}
          />
        </>
      )}
    </Shell>
  );
}
