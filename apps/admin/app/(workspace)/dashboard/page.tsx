import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { ConnectMachineBanner } from "@/components/dashboard/connect-machine-banner";
import { CoverageChart } from "@/components/dashboard/coverage-chart";
import { CycleUtilizationBar } from "@/components/dashboard/cycle-utilization-bar";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { DashboardSetupPanel } from "@/components/dashboard/setup-panel";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import {
  verdictHint,
  verdictLabel,
  verdictToneClass,
  type PlanVerdictCode,
} from "@/lib/billing/plan-utilization-policy";
import {
  parseRollingPeriodFromSearch,
  rollingPeriodLabel,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import {
  cycleViewShortSuffix,
  parseCycleView,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import { canonicalToolKey, findCatalogTool, toolDisplayName } from "@/lib/tools/catalog";
import { formatCompactNumber, formatShortDate, formatUsd } from "@/lib/format";
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

function formatPricePerMillionTokens(cost: number, tokens: number) {
  if (tokens <= 0) return "—";
  return formatUsd((cost * 1_000_000) / tokens);
}

function Kpi({
  label,
  value,
  delta,
  inverse,
  accent,
  sub,
  hero,
  compactMobile,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  inverse?: boolean;
  accent?: boolean;
  sub?: string;
  hero?: boolean;
  compactMobile?: boolean;
  className?: string;
}) {
  return (
    <SignalsKpi
      label={label}
      value={value}
      sub={sub}
      hero={hero}
      accent={accent}
      compactMobile={compactMobile}
      className={className}
      footer={delta != null ? <Delta value={delta} inverse={inverse} /> : undefined}
    />
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


function orgCycleSummary(cycles: OrgOverviewV1["subscriptionCycles"]) {
  const withSignal = cycles.filter((row) => row.utilizationPercent != null);
  const avgUtilization =
    withSignal.length > 0
      ? withSignal.reduce((sum, row) => sum + (row.utilizationPercent ?? 0), 0) / withSignal.length
      : null;
  const runningOut = cycles.filter((row) => row.verdictCode === "NEAR_LIMIT").length;
  const overLimit = cycles.filter((row) => row.verdictCode === "LIMIT_EXCEEDED").length;
  const onPlan = cycles.filter(
    (row) => row.verdictCode === "LIGHT_USE" || row.verdictCode === "HEALTHY",
  ).length;
  return { avgUtilization, runningOut, overLimit, onPlan, withSignal: withSignal.length };
}

function fleetStatusBadge(cycles: OrgOverviewV1["subscriptionCycles"]) {
  const { runningOut, overLimit, onPlan, withSignal } = orgCycleSummary(cycles);
  if (withSignal === 0) return null;
  if (overLimit > 0) {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 font-normal text-destructive">
        {overLimit === withSignal ? "Over limit" : `${overLimit} over limit`}
      </Badge>
    );
  }
  if (runningOut > 0) {
    return (
      <Badge
        variant="outline"
        className="border-brand-yellow-dark/40 bg-brand-yellow-pale font-normal text-brand-yellow-dark"
      >
        {runningOut === 1 ? "1 running out" : `${runningOut} running out`}
      </Badge>
    );
  }
  if (onPlan === withSignal) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
        On plan
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
      Steady
    </Badge>
  );
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
  const { avgUtilization } = orgCycleSummary(cycles);
  return (
    <div className={cn("mb-6 flex flex-wrap items-center gap-2", bordered && "border-b pb-4")}>
      <h2 className="text-lg font-semibold tracking-tight">{sectionTitleForView(view, period)}.</h2>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {avgUtilization != null ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {avgUtilization.toFixed(0)}% utilized
          </Badge>
        ) : null}
        {fleetStatusBadge(cycles)}
      </div>
    </div>
  );
}

function CycleStatus({ code }: { code: PlanVerdictCode }) {
  const hint = verdictHint(code);
  return (
    <div className="mt-1.5">
      <p className={cn("text-xs font-medium", verdictToneClass(code))}>{verdictLabel(code)}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function cycleWindowLabel(row: OrgOverviewV1["subscriptionCycles"][number], view: CycleView) {
  if (view === "current_cycles") {
    const renew = `Renews ${formatShortDate(row.billingCycle.nextRenewalDate)}`;
    if (row.planCount > 1) return `${row.planCount} plans · next ${formatShortDate(row.billingCycle.nextRenewalDate)}`;
    if (row.planNames[0]) return `${row.planNames[0]} · ${renew}`;
    return renew;
  }
  if (view === "last_30_days") {
    return `${formatShortDate(row.windowFrom)} – ${formatShortDate(row.windowTo)}`;
  }
  return `${formatShortDate(row.billingCycle.cycleStart)} – ${formatShortDate(row.billingCycle.cycleEnd)}`;
}

function PersonalHome({ data }: { data: Awaited<ReturnType<typeof getMeOverview>> }) {
  const usage = data.usage30d;
  const tokens = Number(BigInt(usage.inputTokens) + BigInt(usage.outputTokens));
  const usageCost = usage.verifiedUsageCost + usage.estimatedApiCost;
  const firstName = data.developer.name.split(" ")[0] || "there";

  return (
    <>
      <ConnectMachineBanner show={!data.developer.devices.length} />
      <div className="mb-10">
        <PageHeader
          className="mb-0"
          title={`Hey ${firstName}.`}
          description="Your device, tools, and last 30 days of traffic."
        />
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
            />
          </div>
          <div className="grid items-start gap-y-8 sm:grid-cols-3">
            <Kpi
              label="Price per 1M tokens"
              value={formatPricePerMillionTokens(usageCost, tokens)}
              hero
              sub="verified + estimated · last 30 days"
              className="border-l-2 border-border-strong py-3 pl-4 pr-3"
            />
            <Kpi
              label="Sessions"
              value={formatCompactNumber(usage.sessions)}
              className="border-l-2 border-border-strong py-3 pl-4 pr-3"
            />
            <Kpi
              label="Devices"
              value={String(data.developer.devices.length)}
              accent
              sub="Enrolled"
            />
          </div>

          <Panel className="mt-10">
            <AiCodingPanel metrics={data.aiCoding30d} models={data.modelUsage30d} embedded />
          </Panel>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Panel as="section">
              <SignalsSectionHeader
                title="Device."
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
                    <Badge variant="outline" className="font-mono text-[0.65rem] uppercase tracking-[0.08em]">
                      agent {device.agentVersion || "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel as="section">
              <SignalsSectionHeader title="Your tools." bordered={false} />
              {data.toolsUsage30d.length ? (
                <ul>
                  {data.toolsUsage30d.map((tool) => (
                    <li key={tool.toolName} className="flex items-center justify-between gap-3 py-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tool.toolName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tool.tokens > 0 ? `${formatCompactNumber(tool.tokens)} tokens` : "Detected on your machine"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">{formatCompactNumber(tool.requests)}</p>
                        {tool.cost > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">{formatUsd(tool.cost)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
                  <EmptyDescription>No tools detected yet. Connect a machine to report inventory.</EmptyDescription>
                </Empty>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function overviewInputForView(
  cycleView: CycleView,
  period: RollingPeriod,
) {
  if (cycleView !== "last_30_days") {
    return { cycleView };
  }
  if (period.kind === "custom") {
    return overviewInputFromBounds(period.from, period.to);
  }
  return overviewInputFromRange(period.days, new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "user"]);
  if (role === "user") {
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
      <PageHeader
        title={empty ? "Nothing reporting yet." : "Spend, traffic, coverage."}
        description={
          empty
            ? "Connect a machine, then invite people. Metrics show up as soon as the first request lands."
            : undefined
        }
        actions={!empty && data ? <CycleViewPicker view={cycleView} period={rollingPeriod} /> : null}
        mobileActionsInline
      />

      {syncContext ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
          />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="rounded-none">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span className="flex-1">{error}</span>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Retry</Link>
            </Button>
          </AlertDescription>
        </Alert>
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
          <div className="grid grid-cols-2 items-stretch gap-y-5 sm:gap-y-8 xl:grid-cols-4">
            <Kpi
              label="Subscription commitment"
              value={formatUsd(data.kpis.actualSpend.value)}
              delta={data.kpis.actualSpend.deltaPercent}
              inverse
              hero
              accent
              compactMobile
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
              value={formatUsd(data.kpis.verifiedUsageCost.value)}
              delta={data.kpis.verifiedUsageCost.deltaPercent}
              inverse
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
            />
            <Kpi
              label="Estimated API value"
              value={formatUsd(data.kpis.estimatedApiCost.value)}
              delta={data.kpis.estimatedApiCost.deltaPercent}
              inverse
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
            />
            <Kpi
              label="Price per 1M tokens"
              value={formatPricePerMillionTokens(
                data.kpis.verifiedUsageCost.value + data.kpis.estimatedApiCost.value,
                data.kpis.tokens.value,
              )}
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={
                data.cycleView === "last_30_days"
                  ? "verified + estimated · selected window"
                  : data.cycleView === "previous_cycles"
                    ? "verified + estimated · previous cycles"
                    : "verified + estimated · current cycles"
              }
            />
          </div>

          <Panel as="section" className="mt-10">
            <CycleSectionHeader
              view={data.cycleView}
              period={rollingPeriod}
              cycles={data.subscriptionCycles}
              bordered={false}
            />
            {data.subscriptionCycles.length ? (
              <ul>
                {data.subscriptionCycles.map((row) => {
                  const toolKey = canonicalToolKey(row.toolKey ?? row.toolName);
                  const href = findCatalogTool(toolKey) ? `/tools/${toolKey}` : null;
                  const body = (
                    <>
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
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-semibold tabular-nums">{formatUsd(row.cycleSpend)}</p>
                          {href ? (
                            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : null}
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
                      {row.verdictCode ? <CycleStatus code={row.verdictCode} /> : null}
                    </>
                  );

                  return (
                    <li key={row.id}>
                      {href ? (
                        <Link
                          href={href}
                          className="block py-5 transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="py-5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
                <EmptyDescription>Add subscriptions to see cycle utilization.</EmptyDescription>
              </Empty>
            )}
          </Panel>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <Panel as="section">
              <SignalsSectionHeader title="Requests." bordered={false} />
              <OverviewChart data={data.trend} />
            </Panel>

            <Panel as="section">
              <SignalsSectionHeader title="Notifications." bordered={false} />
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
                <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
                  <EmptyDescription>No notifications.</EmptyDescription>
                </Empty>
              )}
            </Panel>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Panel as="section">
              <SignalsSectionHeader
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
                        <p className="text-sm font-medium leading-5 tabular-nums">{formatCompactNumber(tool.requests)}</p>
                        <p className="mt-1 text-xs leading-4 text-muted-foreground">{formatUsd(tool.cost)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
                  <EmptyDescription>No tools detected yet.</EmptyDescription>
                </Empty>
              )}
            </Panel>

            <Panel as="section">
              <SignalsSectionHeader title="Coverage." bordered={false} />
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
                    label: "Devices enrolled",
                    value: `${data.coverage.devices}`,
                    pct: data.coverage.devices ? 100 : 0,
                  },
                  {
                    label: "Tools detected",
                    value: `${data.coverage.trackedTools}`,
                    pct: data.coverage.trackedTools ? 100 : 0,
                  },
                ]}
              />
            </Panel>
          </div>

          {data.failures.length > 0 && (
            <Panel as="section" className="mt-10">
              <SignalsSectionHeader title="Failed requests." bordered={false} />
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
            </Panel>
          )}
        </>
      ) : null}
    </>
  );
}
