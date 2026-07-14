import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/app-shell";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { MemberPlanUsage } from "@/components/developers/member-plan-usage";
import { MemberPlansPanel } from "@/components/developers/member-plans-panel";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { cn } from "@/lib/utils";
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
      {sub ? <p className="mt-2 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ developerId: string }>;
}) {
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const { developerId } = await params;
  const reportWindow = resolveReportWindow({ range: 30 });

  const [personal, planUsage] = await Promise.all([
    getDeveloperOverview(orgId, developerId),
    getPlanUsage(
      {
        orgId,
        actorId: userId,
        roles: [role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      { reportWindow, developerId },
    ),
  ]);
  if (!personal) notFound();

  const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));
  const spend = Number(BigInt(personal.usage30d.costMicros)) / 1_000_000;
  const online = personal.developer.devices.filter((device) => device.status === "online").length;

  return (
    <>
      <div className="mb-8">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to roster
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{personal.developer.name}.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {personal.developer.email} · how well plans are used, plus machines and traffic.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Requests" value={compact(personal.usage30d.requests)} accent />
        <Kpi label="Tokens" value={compact(tokens)} sub="input + output" />
        <Kpi label="Spend" value={money(spend)} sub="estimated / verified" />
        <Kpi
          label="Machines"
          value={`${online}/${personal.developer.devices.length}`}
          sub="online · last 5 minutes"
        />
      </div>

      <div className="mt-10">
        <MemberPlanUsage data={planUsage.data} developerName={personal.developer.name} />
      </div>

      <div className="mt-10">
        <AiCodingPanel metrics={personal.aiCoding30d} models={personal.modelUsage30d} />
      </div>

      <div className="mt-10">
        <MemberPlansPanel developerId={personal.developer.id} developerName={personal.developer.name} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <div className="mb-4 border-b pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Machines.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Reporting into this workspace.</p>
          </div>
          {personal.developer.devices.length ? (
            <ul className="divide-y">
              {personal.developer.devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{device.hostname}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {device.os} · {device.tools.length} {device.tools.length === 1 ? "tool" : "tools"}
                    </p>
                  </div>
                  <StatusBadge variant={device.status === "online" ? "success" : "default"}>
                    {device.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No machines enrolled yet.</p>
          )}
        </section>

        <section>
          <div className="mb-4 border-b pb-3">
            <h2 className="text-lg font-semibold tracking-tight">By tool.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Detected on their machines · 30 days.</p>
          </div>
          {personal.toolsUsage30d.length ? (
            <ul className="divide-y">
              {personal.toolsUsage30d.map((tool) => (
                <li key={tool.toolName} className="flex items-center justify-between gap-3 py-4">
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
      </div>
    </>
  );
}
