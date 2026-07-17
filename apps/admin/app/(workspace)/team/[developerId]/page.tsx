import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/app-shell";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { MemberPlanUsage } from "@/components/developers/member-plan-usage";
import { MemberPlansPanel } from "@/components/developers/member-plans-panel";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { serializeBigInts } from "@/lib/billing/validation";
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
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const { developerId } = await params;
  const paramsValue = await searchParams;
  const cycleView = parseCycleView(paramsValue.view);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: paramsValue.days,
    from: paramsValue.from,
    to: paramsValue.to,
  });
  const now = new Date();

  const [roster, subscriptions] = await Promise.all([
    getDeveloperRoster(orgId, { developerId }),
    listSubscriptions(orgId),
  ]);
  const rosterDeveloper = roster.developers[0];
  if (!rosterDeveloper) notFound();
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, rosterDeveloper.manualPlans, now);
  const [personal, planUsage] = await Promise.all([
    getDeveloperOverview(orgId, developerId, { reportWindow }),
    getPlanUsage(
      {
        orgId,
        actorId: userId,
        roles: [role],
        now,
        timezone: UTC_TIMEZONE,
      },
      { reportWindow, developerId },
    ),
  ]);
  if (!personal) notFound();
  const plansInitial = serializeBigInts({ developer: rosterDeveloper, subscriptions }) as unknown as {
    developer: Parameters<typeof MemberPlansPanel>[0]["initialDeveloper"];
    subscriptions: Parameters<typeof MemberPlansPanel>[0]["initialSubscriptions"];
  };

  const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));
  const spend = Number(BigInt(personal.usage30d.costMicros)) / 1_000_000;
  const online = personal.developer.devices.filter((device) => device.status === "online").length;
  const selectedPeriodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);

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

      <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{personal.developer.name}.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {personal.developer.email} · how well plans are used, plus machines and traffic.
          </p>
        </div>
        <CycleViewPicker
          view={cycleView}
          period={rollingPeriod}
          basePath={`/team/${developerId}`}
        />
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Requests" value={compact(personal.usage30d.requests)} sub={selectedPeriodLabel} accent />
        <Kpi label="Tokens" value={compact(tokens)} sub={`input + output · ${selectedPeriodLabel}`} />
        <Kpi label="Usage cost" value={money(spend)} sub={`verified + estimated · ${selectedPeriodLabel}`} />
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
        <MemberPlansPanel
          developerId={personal.developer.id}
          developerName={personal.developer.name}
          initialDeveloper={plansInitial.developer}
          initialSubscriptions={plansInitial.subscriptions}
        />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-tight">Machines.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Reporting into this workspace.</p>
          </div>
          {personal.developer.devices.length ? (
            <ul>
              {personal.developer.devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-3 py-5">
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
            <p className="py-6 text-sm text-muted-foreground">No machines enrolled yet.</p>
          )}
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-tight">By tool.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Detected on their machines · {selectedPeriodLabel}.</p>
          </div>
          {personal.toolsUsage30d.length ? (
            <ul>
              {personal.toolsUsage30d.map((tool) => (
                <li key={tool.toolName} className="flex items-center justify-between gap-3 py-5">
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
            <p className="py-6 text-sm text-muted-foreground">No tools detected yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
