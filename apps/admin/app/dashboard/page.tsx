import { Shell, PageHeader, StatCard, Table, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface OverviewData {
  totalRequests: number;
  requests7d: number;
  totalDevices: number;
  onlineDevices: number;
  totalDevelopers: number;
  totalCost: number;
  cost7d: number;
  errorRate7d: number;
  topTools: Array<{ toolName: string | null; requests: number }>;
  activityByDay: Array<{ date: string; requests: number; cost: number }>;
}

function fmt$(n: number) {
  return n < 0.01 ? `$${(n * 100).toFixed(2)}¢` : `$${n.toFixed(2)}`;
}

export default async function DashboardPage() {
  let data: OverviewData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<OverviewData>("/api/dashboard/overview");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load overview";
  }

  return (
    <Shell active="/dashboard">
      <PageHeader title="Overview" description="Organisation-wide AI usage at a glance" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Requests" value={data.totalRequests.toLocaleString()} sub="all time" />
            <StatCard label="Requests (7d)" value={data.requests7d.toLocaleString()} />
            <StatCard label="Total Cost" value={fmt$(data.totalCost)} sub="all time" />
            <StatCard label="Cost (7d)" value={fmt$(data.cost7d)} />
            <StatCard label="Developers" value={data.totalDevelopers} />
            <StatCard label="Devices" value={data.totalDevices} sub={`${data.onlineDevices} online`} />
            <StatCard
              label="Error Rate (7d)"
              value={`${data.errorRate7d.toFixed(1)}%`}
              sub={data.errorRate7d > 5 ? "above threshold" : "healthy"}
            />
            <StatCard
              label="Active Tools"
              value={data.topTools.length}
              sub="last 7 days"
            />
          </div>

          {data.topTools.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Top tools (7d)</h2>
              <Table
                headers={["Tool", "Requests"]}
                rows={data.topTools.map((t) => [t.toolName ?? "—", t.requests.toLocaleString()])}
              />
            </div>
          )}

          {data.activityByDay.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Daily activity (30d)</h2>
              <Table
                headers={["Date", "Requests", "Cost"]}
                rows={data.activityByDay
                  .slice(-14)
                  .reverse()
                  .map((d) => [d.date, d.requests.toLocaleString(), fmt$(d.cost)])}
              />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
