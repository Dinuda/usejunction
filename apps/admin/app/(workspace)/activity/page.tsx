import type { ReactNode } from "react";
import { StatusBadge } from "@/components/app-shell";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { FlowPath } from "@/components/signals/signals-ui";
import { cn } from "@/lib/utils";
import { getDashboardRequests } from "@/lib/queries/dashboard/requests";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
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

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
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
    <div
      className={cn(
        "border-l-2 pl-4",
        accent ? "border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4" : "border-border-strong",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: ReactNode;
}) {
  if (!rows.length) return <div className="py-6 text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="py-2.5 pr-4 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-muted/30">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-3 pr-4 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function DeveloperActivityView({ orgId, userId, role }: { orgId: string; userId: string; role: "developer" }) {
  const [personal, signalsLedger] = await Promise.all([
    getMeOverview(orgId, userId, role),
    getPersonalSignalsLedger(orgId, userId),
  ]);
  const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));
  const spend = Number(BigInt(personal.usage30d.costMicros)) / 1_000_000;

  return (
    <>
      <div className="mb-8">
        <LocalSyncPanel
          lastSeenAt={personal.sync.lastSeenAt}
          lastUsageSyncAt={personal.sync.lastUsageSyncAt}
          lastAccountSyncAt={personal.sync.lastAccountSyncAt}
          stale={personal.sync.stale}
        />
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Requests" value={compact(personal.usage30d.requests)} accent />
        <Kpi label="Sessions" value={compact(personal.usage30d.sessions)} />
        <Kpi label="Tokens" value={compact(tokens)} sub="input + output" />
        <Kpi label="Usage cost" value={money(spend)} sub="verified + estimated · 30 days" />
      </div>

      <AiCodingPanel metrics={personal.aiCoding30d} models={personal.modelUsage30d} />

      <section className="mt-10">
        <SectionHeader title="By tool." description="Tools detected on your machines." />
        {personal.toolsUsage30d.length ? (
          <ul className="divide-y">
            {personal.toolsUsage30d.map((tool) => (
              <li key={tool.toolName} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tool.toolName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tool.tokens > 0 ? `${compact(tool.tokens)} tokens` : "Detected"}
                    {tool.cost > 0 ? ` · ${money(tool.cost)}` : ""}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">{compact(tool.requests)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No tools detected yet.</p>
        )}
      </section>

      <section className="mt-10">
        <SectionHeader
          title="Your Signals ledger."
          description="App/domain flow metadata only. No prompts, screenshots, full URLs, or clipboard text."
        />
        <DataTable
          headers={["Flow", "Time", "Duration", "Device", "Confidence"]}
          empty="No Signals sessions uploaded yet."
          rows={signalsLedger.map((session) => [
            <FlowPath
              flow={[
                session.domainBefore ?? session.appBefore ?? "unknown",
                session.aiTool,
                session.domainAfter ?? session.appAfter ?? "unknown",
              ].join(" -> ")}
            />,
            <span className="text-muted-foreground">{new Date(session.startedAt).toLocaleString()}</span>,
            <span className="tabular-nums">{duration(session.durationSeconds)}</span>,
            <span>{session.device.hostname}</span>,
            <span className="tabular-nums text-muted-foreground">{Math.round(session.confidence * 100)}%</span>,
          ])}
        />
      </section>
    </>
  );
}

async function AdminUsageView({ orgId }: { orgId: string }) {
  const [usage, requests] = await Promise.all([
    getDashboardUsage(orgId, 30),
    getDashboardRequests(orgId, { limit: 20 }),
  ]);
  const totalTokens = usage.kpis.inputTokens + usage.kpis.outputTokens;
  const totalRequests = usage.kpis.modelCalls;
  const models = usage.byModel;
  const tools = usage.byTool;
  const recent = requests.requests.slice(0, 8);

  return (
    <>
      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Model calls" value={compact(totalRequests)} sub="last 30 days" accent />
        <Kpi label="Tokens" value={compact(totalTokens)} sub="input + output" />
        <Kpi label="Verified usage" value={money(usage.kpis.verifiedUsageCost)} sub="vendor charges" />
        <Kpi label="Estimated API value" value={money(usage.kpis.estimatedApiCost)} sub="rate-card estimate" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionHeader title="By tool." description="Detected and observed tools." />
          {tools.length ? (
            <ul className="divide-y">
              {tools.map((row) => (
                <li key={row.toolName ?? "unknown"} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.toolName ?? "Unknown"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.requests.toLocaleString()} requests</p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">{money(row.cost)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No tool traffic yet.</p>
          )}
        </section>

        <section>
          <SectionHeader title="By model." description={`Every recorded model · ${models.length} total.`} />
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
      </div>

      <section className="mt-10">
        <SectionHeader title="Recent requests." description="Gateway metadata only — prompts are never stored." />
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
          <p className="py-4 text-sm text-muted-foreground">No gateway requests yet. Local tool usage still appears above.</p>
        )}
      </section>
    </>
  );
}

export default async function ActivityPage() {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  const isDeveloper = role === "developer";

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
          {isDeveloper ? "Your activity." : "Activity."}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {isDeveloper
            ? "Personal traffic and your Signals ledger. Metadata only — prompts are never stored."
            : "Last 30 days of traffic from gateway and device-observed usage. Journey insights live under Signals."}
        </p>
      </div>

      {isDeveloper
        ? await DeveloperActivityView({ orgId, userId, role: "developer" })
        : await AdminUsageView({ orgId })}
    </>
  );
}
