import Link from "next/link";
import { StatusBadge } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { getDashboardRequests } from "@/lib/queries/dashboard/requests";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function statusVariant(status: string): "success" | "warning" | "error" | "default" {
  return status === "success"
    ? "success"
    : status === "timeout" || status === "retry"
      ? "warning"
      : status === "failed" || status === "error"
        ? "error"
        : "default";
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn("border-l-2 pl-4", accent ? "border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4" : "border-border-strong")}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHeader({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export default async function ActivityPage() {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);

  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));

    return (
      <>
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">Your usage.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Personal traffic over the last 30 days. Metadata only — prompts are never stored.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          <Kpi label="Requests" value={compact(personal.usage30d.requests)} accent />
          <Kpi label="Sessions" value={compact(personal.usage30d.sessions)} />
          <Kpi label="Tokens" value={compact(tokens)} sub="input + output" />
        </div>

        <section className="mt-10">
          <SectionHeader title="Privacy." />
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Your personal activity is visible to you. UseJunction stores counts, latency, and cost — never prompts or responses.
          </p>
        </section>
      </>
    );
  }

  const [usage, requests] = await Promise.all([
    getDashboardUsage(orgId, 30),
    getDashboardRequests(orgId, { limit: 20 }),
  ]);
  const totalCost = usage.byModel.reduce((sum, row) => sum + row.cost, 0);
  const totalTokens = usage.byModel.reduce((sum, row) => sum + row.tokens, 0);
  const totalRequests = usage.byModel.reduce((sum, row) => sum + row.requests, 0);
  const models = usage.byModel.slice(0, 8);
  const recent = requests.requests.slice(0, 8);

  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">Usage and requests.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Last 30 days of traffic, broken down by model and recent request metadata.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-3">
        <Kpi label="Requests" value={compact(totalRequests)} sub="last 30 days" accent />
        <Kpi label="Tokens" value={compact(totalTokens)} sub="input + output" />
        <Kpi label="Estimated spend" value={money(totalCost)} sub="last 30 days" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="By model."
            description="Which models are doing the work."
          />
          {models.length ? (
            <ul className="divide-y">
              {models.map((row) => (
                <li key={row.model ?? "unknown"} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-medium">{row.model ?? "Unknown"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.requests.toLocaleString()} requests</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">{money(row.cost)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No model traffic yet.</p>
          )}
        </section>

        <section>
          <SectionHeader
            title="Recent requests."
            description="Metadata only — prompts are never stored."
          />
          {recent.length ? (
            <ul className="divide-y">
              {recent.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {request.toolName ?? "Unknown"} · {request.model ?? "Unknown"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                  <StatusBadge variant={statusVariant(request.status)}>{request.status}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No data yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
