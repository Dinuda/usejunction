"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowUpRight, Info } from "lucide-react";
import { ConnectMachineBanner } from "@/components/dashboard/connect-machine-banner";
import { CycleUtilizationBar } from "@/components/dashboard/cycle-utilization-bar";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { DashboardSetupPanel } from "@/components/dashboard/setup-panel";
import { AudienceScopeSwitcher } from "@/components/audience-scope-switcher";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import type { AudienceScope } from "@/lib/audience-scope";
import {
  verdictHint,
  verdictLabel,
  verdictToneClass,
  type PlanVerdictCode,
} from "@/lib/billing/plan-utilization-policy";
import {
  rollingPeriodLabel,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import {
  cycleViewPeriodLabel,
  cycleViewShortSuffix,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import { buildMemberPlanBoard, type MemberPlanBoardCard } from "@/lib/quotas/plan-board";
import type { QuotaPaceCode } from "@/lib/quotas/pace";
import { canonicalToolKey, findCatalogTool, toolDisplayName } from "@/lib/tools/catalog";
import { formatCompactNumber, formatShortDate, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrgOverviewV1 } from "@/lib/insights";
import type { getMeOverview } from "@/lib/queries/me/overview";
import type { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { useAppQuery } from "@/lib/api/client";
import { dashboardKey } from "@/lib/app-pages/query-keys";
import { AppPageError } from "@/components/app-data-state";
import { DashboardCrunchingState } from "@/components/dashboard/dashboard-crunching-state";

const AiCodingPanel = dynamic(() => import("@/components/dashboard/ai-coding-panel").then((mod) => mod.AiCodingPanel), { ssr: false });
const CoverageChart = dynamic(() => import("@/components/dashboard/coverage-chart").then((mod) => mod.CoverageChart), { ssr: false });
const OverviewChart = dynamic(() => import("@/components/dashboard/overview-chart").then((mod) => mod.OverviewChart), { ssr: false });

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

function formatEstSpendPerDay(cost: number, rangeDays: number) {
  if (rangeDays <= 0) return "—";
  return formatUsd(cost / rangeDays);
}

function estSpendPerDayTooltip(view: CycleView) {
  const base = "Verified plus estimated usage divided by the number of days in this view.";
  if (view === "current_cycles") {
    return `${base} For current cycles, the day count is the union of each active plan's billing cycle — from the earliest cycle start to the latest cycle end — not the length of a single plan.`;
  }
  if (view === "previous_cycles") {
    return `${base} For previous cycles, the day count spans the same union across your plans' prior billing cycles.`;
  }
  return `${base} Uses the exact number of days in your selected date range.`;
}

function KpiInfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="How this is calculated"
        >
          <Info className="size-3" strokeWidth={2.25} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function usageCostBreakdownSub(verified: number, estimated: number) {
  return `${formatUsd(verified)} verified · ${formatUsd(estimated)} estimated`;
}

function verifiedEstimatedWindowSub(view: CycleView) {
  if (view === "last_30_days") return "verified + estimated · selected window";
  if (view === "previous_cycles") return "verified + estimated · previous cycles";
  return "verified + estimated · current cycles";
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
  action,
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
  action?: ReactNode;
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
      action={action}
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
  const nearLimit = cycles.filter((row) => row.verdictCode === "NEAR_LIMIT").length;
  const overQuota = cycles.filter((row) => row.verdictCode === "LIMIT_EXCEEDED").length;
  const withinAllowance = cycles.filter(
    (row) => row.verdictCode === "LIGHT_USE" || row.verdictCode === "HEALTHY",
  ).length;
  return { avgUtilization, nearLimit, overQuota, withinAllowance, withSignal: withSignal.length };
}

function fleetVerdictCode(cycles: OrgOverviewV1["subscriptionCycles"]): PlanVerdictCode | null {
  const { nearLimit, overQuota, withinAllowance, withSignal } = orgCycleSummary(cycles);
  if (withSignal === 0) return null;
  if (overQuota > 0) return "LIMIT_EXCEEDED";
  if (nearLimit > 0) return "NEAR_LIMIT";
  if (withinAllowance === withSignal) return "HEALTHY";
  return "HEALTHY";
}

function fleetStatusBadge(cycles: OrgOverviewV1["subscriptionCycles"]) {
  const { nearLimit, overQuota, withinAllowance, withSignal } = orgCycleSummary(cycles);
  if (withSignal === 0) return null;
  if (overQuota > 0) {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 font-normal text-destructive">
        {overQuota === withSignal ? "Over quota" : `${overQuota} over quota`}
      </Badge>
    );
  }
  if (nearLimit > 0) {
    return (
      <Badge
        variant="outline"
        className="border-brand-yellow-dark/40 bg-brand-yellow-pale font-normal text-brand-yellow-dark"
      >
        {nearLimit === 1 ? "1 near limit" : `${nearLimit} near limit`}
      </Badge>
    );
  }
  if (withinAllowance === withSignal) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
        Within allowance
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
      On track
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
  const title = sectionTitleForView(view, period);
  return (
    <div className={cn("mb-6", bordered && "border-b pb-4")}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}.</h2>
        <div className="ml-auto flex min-w-[12rem] max-w-sm flex-1 flex-wrap items-center justify-end gap-3">
          {avgUtilization != null ? (
            <CycleUtilizationBar
              percent={avgUtilization}
              displayPercent={Math.min(100, Math.max(0, avgUtilization))}
              verdictCode={fleetVerdictCode(cycles)}
              label={title}
              size="lg"
            />
          ) : null}
          {fleetStatusBadge(cycles)}
        </div>
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

function paceToVerdictCode(code: QuotaPaceCode, usedPercent: number | null): PlanVerdictCode {
  if (code === "ALREADY_EXCEEDED" || (usedPercent != null && usedPercent >= 100)) return "LIMIT_EXCEEDED";
  if (code === "EXCESS") return "NEAR_LIMIT";
  if (code === "ON_TRACK") return "HEALTHY";
  if (code === "UNDER") return "LIGHT_USE";
  return "UNKNOWN";
}

function personalPlanWindowLabel(card: MemberPlanBoardCard) {
  const plan = card.planName || card.primary?.windowLabel || "Plan";
  if (!card.primary?.resetsAt) return plan;
  const reset = new Date(card.primary.resetsAt);
  if (Number.isNaN(reset.getTime())) return plan;
  return `${plan} · Renews ${formatShortDate(reset.toISOString())}`;
}

function personalCycleSummary(cards: MemberPlanBoardCard[]) {
  const withSignal = cards.filter((card) => card.pace.usedPercent != null);
  const avgUtilization =
    withSignal.length > 0
      ? withSignal.reduce((sum, card) => sum + (card.pace.usedPercent ?? 0), 0) / withSignal.length
      : null;
  const nearLimit = cards.filter((card) => card.pace.code === "EXCESS").length;
  const overQuota = cards.filter(
    (card) => card.pace.code === "ALREADY_EXCEEDED" || (card.pace.usedPercent ?? 0) >= 100,
  ).length;
  const withinAllowance = cards.filter(
    (card) => card.pace.code === "UNDER" || card.pace.code === "ON_TRACK",
  ).length;
  return { avgUtilization, nearLimit, overQuota, withinAllowance, withSignal: withSignal.length };
}

function personalFleetVerdictCode(cards: MemberPlanBoardCard[]): PlanVerdictCode | null {
  const { nearLimit, overQuota, withinAllowance, withSignal } = personalCycleSummary(cards);
  if (withSignal === 0) return null;
  if (overQuota > 0) return "LIMIT_EXCEEDED";
  if (nearLimit > 0) return "NEAR_LIMIT";
  if (withinAllowance === withSignal) return "HEALTHY";
  return "HEALTHY";
}

function personalFleetStatusBadge(cards: MemberPlanBoardCard[]) {
  const { nearLimit, overQuota, withinAllowance, withSignal } = personalCycleSummary(cards);
  if (withSignal === 0) return null;
  if (overQuota > 0) {
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 font-normal text-destructive">
        {overQuota === withSignal ? "Over quota" : `${overQuota} over quota`}
      </Badge>
    );
  }
  if (nearLimit > 0) {
    return (
      <Badge
        variant="outline"
        className="border-brand-yellow-dark/40 bg-brand-yellow-pale font-normal text-brand-yellow-dark"
      >
        {nearLimit === 1 ? "1 near limit" : `${nearLimit} near limit`}
      </Badge>
    );
  }
  if (withinAllowance === withSignal) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
        Within allowance
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/10 font-normal text-primary">
      On track
    </Badge>
  );
}

function PersonalHome({
  data,
  audienceSwitcher,
  allowPeriodControls,
  cycleView,
  rollingPeriod,
}: {
  data: Awaited<ReturnType<typeof getMeOverview>>;
  audienceSwitcher?: ReactNode;
  allowPeriodControls: boolean;
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
}) {
  const usage = data.usage30d;
  const usageCost = data.kpis.verifiedUsageCost + data.kpis.estimatedApiCost;
  const empty = !data.developer.devices.length;
  const accounts = data.developer.devices.flatMap((device) => device.accounts);
  const quotaSnapshots = data.developer.devices.flatMap((device) =>
    device.quotas.map((quota) => ({
      toolName: quota.toolName,
      windowType: quota.windowType,
      usedPercent: quota.usedPercent,
      creditsRemaining: quota.creditsRemaining,
      resetAt: quota.resetAt,
      source: quota.source,
      updatedAt: quota.updatedAt,
      developerId: data.developer.id,
    })),
  );
  const planCards = buildMemberPlanBoard({
    snapshots: quotaSnapshots,
    accounts,
    assignedPlans: data.developer.assignedPlans,
    toolsUsage: data.toolsUsage30d,
  });
  const { avgUtilization } = personalCycleSummary(planCards);

  return (
    <>
      <ConnectMachineBanner show={empty} />
      <PageHeader
        title={empty ? "Nothing reporting yet." : "Spend, traffic, coverage."}
        description={
          empty
            ? "Connect a machine to see your plans, usage, and traffic."
            : undefined
        }
        actions={
          !empty && allowPeriodControls ? (
            <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/dashboard" />
          ) : null
        }
        mobileActionsInline
      >
        {audienceSwitcher}
      </PageHeader>

      {empty ? (
        <DashboardSetupPanel canInvite={false} />
      ) : (
        <>
          <div className="mb-8">
            <LocalSyncPanel
              lastSeenAt={data.sync.lastSeenAt}
              lastUsageSyncAt={data.sync.lastUsageSyncAt}
              lastAccountSyncAt={data.sync.lastAccountSyncAt}
              dashboardReady={data.sync.dashboardReady}
              dirtyDayCount={data.sync.dirtyDayCount}
            />
          </div>
          <div className="grid grid-cols-2 items-stretch gap-y-5 sm:gap-y-8 xl:grid-cols-4">
            <Kpi
              label="Subscription commitment"
              value={formatUsd(data.kpis.subscriptionCommitment)}
              hero
              accent
              compactMobile
              sub={
                cycleView === "last_30_days"
                  ? "prorated for selected window"
                  : cycleView === "previous_cycles"
                    ? "your seats · previous cycle"
                    : "your seats · current cycle"
              }
            />
            <Kpi
              label="Estimated usage"
              value={formatUsd(usageCost)}
              inverse
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={usageCostBreakdownSub(usage.verifiedUsageCost, usage.estimatedApiCost)}
            />
            <Kpi
              label="Est. spend/day"
              value={formatEstSpendPerDay(usageCost, data.observation.rangeDays)}
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={`${data.observation.rangeDays} days · ${cycleViewPeriodLabel(cycleView, rollingPeriod)}`}
              action={<KpiInfoTooltip content={estSpendPerDayTooltip(cycleView)} />}
            />
            <Kpi
              label="Price per 1M tokens"
              value={formatPricePerMillionTokens(usageCost, data.kpis.tokens)}
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={verifiedEstimatedWindowSub(cycleView)}
            />
          </div>

          <Panel as="section" className="mt-10">
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold tracking-tight">Your plans.</h2>
                <div className="ml-auto flex min-w-[12rem] max-w-sm flex-1 flex-wrap items-center justify-end gap-3">
                  {avgUtilization != null ? (
                    <CycleUtilizationBar
                      percent={avgUtilization}
                      displayPercent={Math.min(100, Math.max(0, avgUtilization))}
                      verdictCode={personalFleetVerdictCode(planCards)}
                      label="Your plans"
                      size="lg"
                    />
                  ) : null}
                  {personalFleetStatusBadge(planCards)}
                </div>
              </div>
            </div>
            {planCards.length ? (
              <ul>
                {planCards.map((card) => {
                  const href = findCatalogTool(card.toolKey) ? `/tools/${card.toolKey}` : null;
                  const used = card.pace.usedPercent;
                  const verdictCode = paceToVerdictCode(card.pace.code, used);
                  const body = (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ToolLogoTile tool={card.toolName} size="md" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{card.toolLabel}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {personalPlanWindowLabel(card)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-semibold tabular-nums">
                            {card.usage && card.usage.cost > 0 ? formatUsd(card.usage.cost) : "—"}
                          </p>
                          {href ? (
                            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3">
                        <CycleUtilizationBar
                          percent={used}
                          displayPercent={used == null ? null : Math.min(100, Math.max(0, used))}
                          verdictCode={verdictCode}
                          label={card.toolLabel}
                        />
                      </div>
                      {verdictCode !== "UNKNOWN" ? <CycleStatus code={verdictCode} /> : null}
                    </>
                  );

                  return (
                    <li key={card.toolKey}>
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
                <EmptyDescription>No plan windows yet. Connect a machine to report quotas.</EmptyDescription>
              </Empty>
            )}
          </Panel>

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
                {data.developer.devices.map((device) => {
                  const toolCount = new Set(device.tools.map((tool) => canonicalToolKey(tool.toolName))).size;
                  return (
                    <li key={device.id} className="flex items-center justify-between gap-3 py-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{device.hostname}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {device.os} · {toolCount} {toolCount === 1 ? "tool" : "tools"}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-[0.65rem] uppercase tracking-[0.08em]">
                        agent {device.agentVersion || "—"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel as="section">
              <SignalsSectionHeader title="Your tools." bordered={false} />
              {data.toolsUsage30d.length ? (
                <ul>
                  {data.toolsUsage30d.map((tool) => (
                    <li key={canonicalToolKey(tool.toolName)} className="flex items-center justify-between gap-3 py-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{toolDisplayName(tool.toolName)}</p>
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

type DashboardPayload =
  | {
      kind: "personal";
      scope: AudienceScope;
      canSwitchAudience: boolean;
      youUnlinked?: boolean;
      allowPeriodControls: boolean;
      cycleView: CycleView;
      rollingPeriod: RollingPeriod;
      periodLabel: string;
      personal: Awaited<ReturnType<typeof getMeOverview>> | null;
      needsPersonalConnect?: boolean;
      syncContext?: Awaited<ReturnType<typeof getLocalSyncContext>>;
    }
  | {
      kind: "organization";
      scope: AudienceScope;
      canSwitchAudience: boolean;
      cycleView: CycleView;
      rollingPeriod: RollingPeriod;
      overview: OrgOverviewV1 | null;
      error: string | null;
      needsPersonalConnect: boolean;
      syncContext: Awaited<ReturnType<typeof getLocalSyncContext>>;
    };

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const query = useAppQuery<DashboardPayload>(
    dashboardKey(queryString),
    `/api/app/dashboard${queryString ? `?${queryString}` : ""}`,
  );
  // Pending without cached data: plain skeleton first; crunching copy only after 1.5s.
  if (query.isPending && !query.data) return <DashboardCrunchingState />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;

  const switcher = query.data.canSwitchAudience ? <AudienceScopeSwitcher /> : null;

  if (query.data.kind === "personal") {
    if (query.data.youUnlinked || !query.data.personal) {
      return (
        <>
          <ConnectMachineBanner show={query.data.needsPersonalConnect ?? true} />
          <PageHeader
            title="Your numbers."
            description="Link a developer profile and connect a machine to see personal usage here."
          >
            {switcher}
          </PageHeader>
          {query.data.syncContext ? (
            <div className="mb-8">
              <LocalSyncPanel
                lastSeenAt={query.data.syncContext.lastSeenAt}
                lastUsageSyncAt={query.data.syncContext.lastUsageSyncAt}
                lastAccountSyncAt={query.data.syncContext.lastAccountSyncAt}
                dashboardReady={query.data.syncContext.dashboardReady}
                dirtyDayCount={query.data.syncContext.dirtyDayCount}
              />
            </div>
          ) : null}
          <DashboardSetupPanel canInvite={false} />
        </>
      );
    }
    return (
      <PersonalHome
        data={query.data.personal}
        audienceSwitcher={switcher}
        allowPeriodControls={query.data.allowPeriodControls}
        cycleView={query.data.cycleView}
        rollingPeriod={query.data.rollingPeriod}
      />
    );
  }

  const { cycleView, rollingPeriod, error, needsPersonalConnect, syncContext } = query.data;
  const data = query.data.overview;
  const empty = data && !data.hasActivity && data.coverage.devices === 0;

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
      >
        {switcher}
      </PageHeader>

      {syncContext ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            dashboardReady={syncContext.dashboardReady}
            dirtyDayCount={syncContext.dirtyDayCount}
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
        <DashboardSetupPanel />
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
              label="Estimated usage"
              value={formatUsd(data.kpis.verifiedUsageCost.value + data.kpis.estimatedApiCost.value)}
              delta={data.kpis.verifiedUsageCost.deltaPercent}
              inverse
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={usageCostBreakdownSub(
                data.kpis.verifiedUsageCost.value,
                data.kpis.estimatedApiCost.value,
              )}
            />
            <Kpi
              label="Est. spend/day"
              value={formatEstSpendPerDay(
                data.kpis.verifiedUsageCost.value + data.kpis.estimatedApiCost.value,
                data.observation.rangeDays,
              )}
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={`${data.observation.rangeDays} days · ${cycleViewPeriodLabel(data.cycleView, rollingPeriod)}`}
              action={<KpiInfoTooltip content={estSpendPerDayTooltip(data.cycleView)} />}
            />
            <Kpi
              label="Price per 1M tokens"
              value={formatPricePerMillionTokens(
                data.kpis.verifiedUsageCost.value + data.kpis.estimatedApiCost.value,
                data.kpis.tokens.value,
              )}
              compactMobile
              className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
              sub={verifiedEstimatedWindowSub(data.cycleView)}
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
                  const usageCost = row.verifiedUsageCost + row.estimatedApiCost;
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
                              {row.cycleSpend > 0 ? ` · Seat ${formatUsd(row.cycleSpend)}` : null}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-semibold tabular-nums">
                            {usageCost > 0 ? formatUsd(usageCost) : "—"}
                          </p>
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
                      {row.verdictCode && row.verdictCode !== "UNKNOWN" ? (
                        <CycleStatus code={row.verdictCode} />
                      ) : usageCost > 0 ? (
                        <div className="mt-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Estimated usage</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Token cost this cycle · plan seat is {formatUsd(row.cycleSpend)}/mo
                          </p>
                        </div>
                      ) : row.verdictCode ? (
                        <CycleStatus code={row.verdictCode} />
                      ) : null}
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
