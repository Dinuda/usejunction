import { Shell, PageHeader, Table, StatCard, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface Developer {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  totalRequests: number;
  requests7d: number;
  cost7d: number;
  devices: Array<{ id: string; hostname: string; status: string; lastSeenAt: string }>;
}

interface DevelopersData {
  developers: Developer[];
}

function fmt$(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function DevelopersPage() {
  let data: DevelopersData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<DevelopersData>("/api/dashboard/developers");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load developers";
  }

  return (
    <Shell active="/developers">
      <PageHeader title="Developers" description="Team members enrolled in UseJunction" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard label="Total Developers" value={data.developers.length} />
            <StatCard
              label="Active (7d)"
              value={data.developers.filter((d) => d.requests7d > 0).length}
            />
            <StatCard
              label="Total Requests (7d)"
              value={data.developers.reduce((s, d) => s + d.requests7d, 0).toLocaleString()}
            />
          </div>

          <Table
            headers={["Developer", "Email", "Role", "Devices", "Requests", "Cost (7d)", "Joined"]}
            rows={data.developers.map((d) => [
              d.name,
              <span key="e" className="text-xs text-zinc-500">{d.email}</span>,
              <StatusBadge key="r" variant={d.role === "admin" ? "warning" : "default"}>{d.role}</StatusBadge>,
              <span key="devs" className="text-xs">
                {d.devices.length > 0
                  ? d.devices.map((dv) => dv.hostname).join(", ")
                  : <span className="text-zinc-600">none</span>}
              </span>,
              d.totalRequests.toLocaleString(),
              fmt$(d.cost7d),
              new Date(d.createdAt).toLocaleDateString(),
            ])}
          />
        </>
      )}
    </Shell>
  );
}
