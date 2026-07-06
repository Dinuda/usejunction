import { Shell, PageHeader, Table } from "@/components/app-shell";
import { formatCost, formatNumber } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getUsage(source: string) {
  return serverFetch(`/api/dashboard/usage?source=${source}`) ?? { usage: [] };
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;
  const source = params.source || "combined";
  const { usage } = await getUsage(source);

  return (
    <Shell active="/usage">
      <PageHeader title="Usage" description="Breakdown by user, tool, model, and day" />
      <div className="mb-4 flex gap-2">
        {["combined", "gateway", "local_scan"].map((s) => (
          <a
            key={s}
            href={`/usage?source=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              source === s ? "bg-cyan-500/10 text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s}
          </a>
        ))}
      </div>
      <Table
        headers={["Date", "Source", "User", "Tool", "Model", "Tokens", "Cost"]}
        rows={usage.slice(0, 100).map((u: {
          date: string;
          source: string;
          user: string;
          tool: string;
          model: string;
          tokens: number;
          cost: number;
        }) => [
          u.date,
          u.source,
          u.user || "—",
          u.tool || "—",
          u.model || "—",
          formatNumber(u.tokens),
          formatCost(u.cost),
        ])}
      />
    </Shell>
  );
}
