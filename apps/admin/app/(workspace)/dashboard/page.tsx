import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { ConnectMachineBanner } from "@/components/dashboard/connect-machine-banner";
import { CoverageChart } from "@/components/dashboard/coverage-chart";
import { CycleUtilizationBar } from "@/components/dashboard/cycle-utilization-bar";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { DashboardSetupPanel } from "@/components/dashboard/setup-panel";
import { ToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verdictLabel, type PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import {
  parseRollingPeriodFromSearch,
  rollingPeriodLabel,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import { cycleViewShortSuffix, parseCycleView, type CycleView } from "@/lib/dashboard/cycle-view";
import { toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  getOrgOverview,
  overviewInputFromBounds,
  overviewInputFromRange,
  type OrgOverviewV1,
} from "@/lib/insights";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { getMeOverview } from "@/lib/queries/me/overview";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { prisma } from "@usejunction/db";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return null;
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", good ? "text-success" : "text-destructive")}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(0)}%
    </span>
  );
}

const dashboardCard = "border bg-card p-5";

function Kpi({
  label,
  value,
  delta,
  inverse,
  accent,
  sub,
  hero,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  inverse?: boolean;
  accent?: boolean;
  sub?: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(className, accent && "bg-brand-yellow-pale/70 px-4 py-3")}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-semibold tracking-tight tabular-nums", hero ? "text-4xl" : "text-3xl")}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      {delta != null && (
        <div className="mt-2">
          <Delta value={delta} inverse={inverse} />
        </div>
      )}
    </div>
  );
}

function DashboardSectionHeader({
  title,
  description,
  action,
  bordered = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-3", bordered && "border-b pb-4")}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const cycleViewLabels: Record<CycleView, string> = {
  current_cycles: "Current cycles",
  previous_cycles: "Previous cycles",
  last_30_days: "Last 30 days",
};

function sectionTitleForView(view: CycleView, period: RollingPeriod) {
  if (view === "last_30_days") return rollingPeriodLabel(period);
  return cycleViewLabels[view];
}


function cycleUsageMeta(row: OrgOverviewV1["subscriptionCycles"][number]) {
  return `${compactNumber(row.modelCalls)} ${row.modelCalls === 1 ? "call" : "calls"}`;
}

function orgCycleSummary(cycles: OrgOverviewV1["subscriptionCycles"]) {
  const withSignal = cycles.filter((row) => row.utilizationPercent != null);
  const avgUtilization =
    withSignal.length > 0
      ? withSignal.reduce((sum, row) => sum + (row.utilizationPercent ?? 0), 0) / withSignal.length
      : null;
  const nearLimit = cycles.filter(
    (row) => row.verdictCode === "NEAR_LIMIT" || row.verdictCode === "LIMIT_EXCEEDED",
  ).length;
  return { avgUtilization, nearLimit };
}

function CycleSectionHeader({
  view,
  period,
  cycles,
  bordered = false,
}: {
  view: CycleView;
  period: RollingPeriod;
  cycles: OrgOverviewV1["subscriptionCycles"];
  bordered?: boolean;
}) {
  const { avgUtilization, nearLimit } = orgCycleSummary(cycles);
  return (
    <div className={cn("mb-6 flex flex-wrap items-center gap-2", bordered && "border-b pb-4")}>
      <h2 className="text-lg font-semibold tracking-tight">{sectionTitleForView(view, period)}.</h2>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {avgUtilization != null ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {avgUtilization.toFixed(0)}% utilized
          </Badge>
        ) : null}
        {nearLimit > 0 ? (
          <Badge
            variant="outline"
            className="border-brand-yellow-dark/40 bg-brand-yellow-pale font-normal text-brand-yellow-dark"
          >
            {nearLimit} near limit
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function cycleWindowLabel(row: OrgOverviewV1["subscriptionCycles"][number], view: CycleView) {
  if (view === "current_cycles") {
    const renew = `Renews ${shortDate(row.billingCycle.nextRenewalDate)}`;
    if (row.planCount > 1) return `${row.planCount} plans · next ${shortDate(row.billingCycle.nextRenewalDate)}`;
    if (row.planNames[0]) return `${row.planNames[0]} · ${renew}`;
    return renew;
  }
  if (view === "last_30_days") {
    return `${shortDate(row.windowFrom)} – ${shortDate(row.windowTo)}`;
  }
  return `${shortDate(row.billingCycle.cycleStart)} – ${shortDate(row.billingCycle.cycleEnd)}`;
}

function PersonalHome({ data }: { data: Awaited<ReturnType<typeof getMeOverview>> }) {
  const usage = data.usage30d;
  const online = data.developer.devices.filter((device) => device.status === "online").length;
  const firstName = data.developer.name.split(" ")[0] || "there";

  return (
    <>
      <ConnectMachineBanner show={!data.developer.devices.length} />
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">Hey {firstName}.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Your machines, tools, and last 30 days of traffic.
        </p>
      </div>

      {!data.developer.devices.length ? (
        <DashboardSetupPanel canInvite={false} />
      ) : (
        <>
          <div className="mb-8">
            <LocalSyncPanel
              lastSeenAt={data.sync.lastSeenAt}
              lastUsageSyncAt={data.sync.lastUsageSyncAt}
              lastAccountSyncAt={data.sync.lastAccountSyncAt}
              stale={data.sync.stale}
            />
          </div>
          <div className="grid gap-y-8 sm:grid-cols-3">
            <Kpi label="Model calls" value={compactNumber(usage.requests)} hero className="pl-1" />
            <Kpi label="Sessions" value={compactNumber(usage.sessions)} className="sm:border-l sm:border-border sm:pl-8" />
            <Kpi label="Devices" value={`${online}/${data.developer.devices.length}`} accent className="sm:border-l sm:border-border sm:pl-8" />
          </div>

          <div className={cn("mt-10", dashboardCard)}>
            <AiCodingPanel metrics={data.aiCoding30d} models={data.modelUsage30d} embedded />
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section className={dashboardCard}>
              <DashboardSectionHeader
                title="Machines."
                bordered={false}
                action={
                  <Link href="/tools" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    Tools
                  </Link>
                }
              />
              <ul>
                {data.developer.devices.map((device) => (
                  <li key={device.id} className="flex items-center justify-between gap-3 py-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.hostname}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {device.os} · {device.tools.length} tools
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[0.65rem] uppercase tracking-[0.08em]",
                        device.status === "online" && "border-success/30 bg-success/10 text-success",
                      )}
                    >
                      {device.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>

            <section className={dashboardCard}>
              <DashboardSectionHeader title="Your tools." bordered={false} />
              {data.toolsUsage30d.length ? (
                <ul>
                  {data.toolsUsage30d.map((tool) => (
                    <li key={tool.toolName} className="flex items-center justify-between gap-3 py-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tool.toolName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tool.tokens > 0 ? `${compactNumber(tool.tokens)} tokens` : "Detected on your machine"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">{compactNumber(tool.requests)}</p>
                        {tool.cost > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">{currency(tool.cost)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No tools detected yet. Connect a machine to report inventory.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function overviewInputForView(cycleView: CycleView, period: RollingPeriod) {
  if (cycleView !== "last_30_days") {
    return overviewInputFromRange(30, new Date(), cycleView);
  }
  if (period.kind === "custom") {
    return overviewInputFromBounds(period.from, period.to, cycleView);
  }
  return overviewInputFromRange(period.days, new Date(), cycleView);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    return <PersonalHome data={personal} />;
  }

  const params = await searchParams;
  const cycleView = parseCycleView(params.view);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: params.days,
    from: params.from,
    to: params.to,
  });
  let data: OrgOverviewV1 | null = null;
  let error: string | null = null;
  try {
    const envelope = await getOrgOverview(
      {
        orgId,
        actorId: userId,
        roles: [role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      overviewInputForView(cycleView, rollingPeriod),
    );
    data = envelope.data;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not load dashboard.";
  }

  const empty = data && !data.hasActivity && data.coverage.devices === 0;
  const [myDeveloper, syncContext] = await Promise.all([
    prisma.developer.findFirst({
      where: { orgId, authUserId: userId },
      select: { id: true, _count: { select: { devices: true } } },
    }),
    getLocalSyncContext(orgId, userId),
  ]);
  const needsPersonalConnect = !myDeveloper || myDeveloper._count.devices === 0;

  return (
    <>
      <ConnectMachineBanner show={needsPersonalConnect} />
      <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
            {empty ? "Nothing reporting yet." : "Spend, traffic, coverage."}
          </h1>
          {empty ? (
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Connect a machine, then invite people. Metrics show up as soon as the first request lands.
            </p>
          ) : null}
        </div>
        {!empty && data ? <CycleViewPicker view={cycleView} period={rollingPeriod} /> : null}
      </div>

      {syncContext ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            stale={syncContext.stale}
          />
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center gap-3 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Retry</Link>
          </Button>
        </div>
      ) : empty ? (
        <div>
          <div className="uj-grid-texture uj-grid-texture-strong relative mb-10 overflow-hidden border border-primary-dark bg-primary p-6 text-primary-foreground sm:p-8 [--uj-grid-opacity:0.1]">
            <p className="relative max-w-lg text-2xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-3xl">
              Visibility before control.
            </p>
          </div>
          <DashboardSetupPanel />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Subscription commitment"
              value={currency(data.kpis.actualSpend.value)}
              delta={data.kpis.actualSpend.deltaPercent}
              inverse
              accent
              hero
              className="pl-1"
              sub={
                data.cycleView === "last_30_days"
                  ? "prorated for selected window"
                  : data.cycleView === "previous_cycles"
                    ? "purchased seats · previous cycle"
                    : "purchased seats · current cycle"
              }
            />
            <Kpi
              label="Verified usage"
              value={currency(data.kpis.verifiedUsageCost.value)}
              delta={data.kpis.verifiedUsageCost.deltaPercent}
              inverse
              className="sm:border-l sm:border-border sm:pl-8"
            />
            <Kpi
              label="Estimated API value"
              value={currency(data.kpis.estimatedApiCost.value)}
              delta={data.kpis.estimatedApiCost.deltaPercent}
              inverse
              className="xl:border-l xl:border-border xl:pl-8"
            />
            <Kpi
              label="Model calls"
              value={compactNumber(data.kpis.modelCalls.value)}
              delta={data.kpis.modelCalls.deltaPercent}
              className="sm:border-l sm:border-border sm:pl-8 xl:pl-8"
            />
          </div>

          <section className={cn("mt-10", dashboardCard)}>
            <CycleSectionHeader
              view={data.cycleView}
              period={rollingPeriod}
              cycles={data.subscriptionCycles}
              bordered={false}
            />
            {data.subscriptionCycles.length ? (
              <ul>
                {data.subscriptionCycles.map((row) => (
                  <li key={row.id} className="py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ToolLogoTile tool={row.toolKey ?? row.toolName} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {toolDisplayName(row.toolKey ?? row.toolName)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {cycleWindowLabel(row, data.cycleView)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{currency(row.cycleSpend)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{cycleUsageMeta(row)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <CycleUtilizationBar
                        percent={row.utilizationPercent}
                        displayPercent={row.utilizationDisplayPercent}
                        verdictCode={row.verdictCode}
                        label={toolDisplayName(row.toolKey ?? row.toolName)}
                      />
                    </div>
                    {row.verdictCode ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {verdictLabel(row.verdictCode)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">Add subscriptions to see cycle utilization.</p>
            )}
          </section>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <section className={dashboardCard}>
              <DashboardSectionHeader title="Model calls." bordered={false} />
              <OverviewChart data={data.trend} />
            </section>

            <section className={dashboardCard}>
              <DashboardSectionHeader title="Notifications." bordered={false} />
              {data.attention.length ? (
                <ul>
                  {data.attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-start gap-3 py-5 transition-colors hover:bg-muted/30"
                      >
                        <span
                          className={cn(
                            "mt-1 size-2 shrink-0 rounded-full",
                            item.severity === "error" ? "bg-destructive" : "bg-warning",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{item.title}</span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No notifications.</p>
              )}
            </section>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section className={dashboardCard}>
              <DashboardSectionHeader
                title="Tools."
                bordered={false}
                action={
                  <Link href="/tools" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    All tools
                  </Link>
                }
              />
              {data.tools.length ? (
                <ul>
                  {data.tools.map((tool) => (
                    <li key={tool.name} className="flex items-start justify-between gap-3 py-5">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
                          <ToolBrandIcon tool={tool.name} size={14} className="text-muted-foreground" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium leading-5">{toolDisplayName(tool.name)}</p>
                          <p className="mt-1 text-xs leading-4 text-muted-foreground">{tool.activeDevelopers} active</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium leading-5 tabular-nums">{compactNumber(tool.requests)}</p>
                        <p className="mt-1 text-xs leading-4 text-muted-foreground">{currency(tool.cost)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">No tools detected yet.</p>
              )}
            </section>

            <section className={dashboardCard}>
              <DashboardSectionHeader title="Coverage." bordered={false} />
              <CoverageChart
                rows={[
                  {
                    label: `Active people (${cycleViewShortSuffix(cycleView, rollingPeriod)})`,
                    value: `${data.coverage.activeDevelopers}/${data.coverage.developers}`,
                    pct: data.coverage.developers
                      ? Math.min(100, (data.coverage.activeDevelopers / data.coverage.developers) * 100)
                      : 0,
                  },
                  {
                    label: "Devices online",
                    value: `${data.coverage.onlineDevices}/${data.coverage.devices}`,
                    pct: data.coverage.devices
                      ? Math.round((data.coverage.onlineDevices / data.coverage.devices) * 100)
                      : 0,
                  },
                  {
                    label: "Tools detected",
                    value: `${data.coverage.trackedTools}`,
                    pct: data.coverage.trackedTools ? 100 : 0,
                  },
                ]}
              />
            </section>
          </div>

          {data.failures.length > 0 && (
            <section className={cn("mt-10", dashboardCard)}>
              <DashboardSectionHeader title="Failed requests." bordered={false} />
              <ul>
                {data.failures.map((failure) => (
                  <li key={failure.id} className="flex flex-wrap items-center gap-3 py-5">
                    <span className="size-2 rounded-full bg-destructive" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {failure.tool} · {failure.model}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {failure.developer} · {new Date(failure.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[0.65rem] uppercase tracking-[0.08em] text-destructive">
                      {failure.status}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">{failure.latencyMs}ms</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}
    </>
  );
}
