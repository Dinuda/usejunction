import { Shell, PageHeader, StatCard, Table, StatusBadge } from "@/components/app-shell";
import { formatCost, formatNumber } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getOverview() {
  return serverFetch("/api/dashboard/overview");
}

export default async function OverviewPage() {
  const data = await getOverview();

  return (
    <Shell active="/dashboard">
      <PageHeader
        title="Overview"
        description="AI coding usage across your engineering team"
      />
      {data ? (
        <>
          {data.providerIncidents?.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {data.providerIncidents.map((p: { provider: string; status: string; description?: string }) => (
                <StatusBadge
                  key={p.provider}
                  variant={p.status === "operational" ? "success" : p.status === "degraded" ? "warning" : "error"}
                >
                  {p.provider}: {p.status}
                </StatusBadge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 mb-8">
            <StatCard label="Requests (24h)" value={formatNumber(data.totalRequests)} />
            <StatCard label="Tokens" value={formatNumber(data.totalTokens)} />
            <StatCard label="Est. Cost" value={formatCost(data.totalCost)} />
            <StatCard label="Avg Latency" value={`${data.avgLatency}ms`} />
            <StatCard label="Error Rate" value={`${(data.errorRate * 100).toFixed(1)}%`} />
            <StatCard label="Active Devs" value={data.activeDevelopers} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Top Models</h2>
              <Table
                headers={["Model", "Tokens"]}
                rows={data.topModels.map((m: { name: string; value: number }) => [
                  m.name,
                  formatNumber(m.value),
                ])}
              />
            </div>
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Top Users</h2>
              <Table
                headers={["User", "Cost"]}
                rows={data.topUsers.map((u: { name: string; value: number }) => [
                  u.name,
                  formatCost(u.value),
                ])}
              />
            </div>
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Top Tools</h2>
              <Table
                headers={["Tool", "Tokens"]}
                rows={data.topTools.map((t: { name: string; value: number }) => [
                  t.name,
                  formatNumber(t.value),
                ])}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-zinc-500">Unable to load overview. Start the admin server and seed the database.</p>
      )}
    </Shell>
  );
}
