import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { ConnectMachineBanner } from "@/components/dashboard/connect-machine-banner";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { DashboardSetupPanel } from "@/components/dashboard/setup-panel";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verdictLabel, type PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import {
  parseRollingPeriodFromSearch,
  rollingPeriodLabel,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import { toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  ACTIVE_PEOPLE_WINDOW_DAYS,
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

function Kpi({
  label,
  value,
  delta,
  inverse,
  accent,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  inverse?: boolean;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className={cn("border-l-2 pl-4", accent ? "border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4" : "border-border-strong")}>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      {delta != null && (
        <div className="mt-2">
          <Delta value={delta} inverse={inverse} />
        </div>
      )}
    </div>
  );
}

type CycleView = OrgOverviewV1["cycleView"];

const cycleViewLabels: Record<CycleView, string> = {
  current_cycles: "Current cycles",
  previous_cycles: "Previous cycles",
  last_30_days: "Last 30 days",
};

function sectionTitleForView(view: CycleView, period: RollingPeriod) {
  if (view === "last_30_days") return rollingPeriodLabel(period);
  return cycleViewLabels[view];
}

function toneForVerdict(code: PlanVerdictCode | null) {
  switch (code) {
    case "LIGHT_USE":
      return "text-muted-foreground";
    case "HEALTHY":
      return "text-primary";
    case "NEAR_LIMIT":
      return "text-brand-yellow-dark";
    case "LIMIT_EXCEEDED":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function barToneForVerdict(code: PlanVerdictCode | null) {
  if (code === "LIMIT_EXCEEDED") return "bg-destructive";
  if (code === "NEAR_LIMIT") return "bg-brand-yellow-dark";
  if (code === "LIGHT_USE") return "bg-muted-foreground/35";
  if (code == null) return "bg-muted";
  return "bg-primary";
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
}: {
  view: CycleView;
  period: RollingPeriod;
  cycles: OrgOverviewV1["subscriptionCycles"];
}) {
  const { avgUtilization, nearLimit } = orgCycleSummary(cycles);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-3">
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
          <div className="grid gap-8 sm:grid-cols-3">
            <Kpi label="Model calls" value={compactNumber(usage.requests)} />
            <Kpi label="Sessions" value={compactNumber(usage.sessions)} />
            <Kpi label="Devices" value={`${online}/${data.developer.devices.length}`} accent />
          </div>

          <AiCodingPanel metrics={data.aiCoding30d} models={data.modelUsage30d} />

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section>
              <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Machines.</h2>
                <Link href="/tools" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Tools
                </Link>
              </div>
              <ul className="divide-y">
                {data.developer.devices.map((device) => (
                  <li key={device.id} className="flex items-center justify-between gap-3 py-4">
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

            <section>
              <div className="mb-4 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Your tools.</h2>
              </div>
              {data.toolsUsage30d.length ? (
                <ul className="divide-y">
                  {data.toolsUsage30d.map((tool) => (
                    <li key={tool.toolName} className="flex items-center justify-between gap-3 py-4">
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
                <p className="py-4 text-sm text-muted-foreground">No tools detected yet. Connect a machine to report inventory.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function parseCycleView(value: string | undefined): CycleView {
  if (value === "previous_cycles" || value === "last_30_days") return value;
  return "current_cycles";
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
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Subscription commitment"
              value={currency(data.kpis.actualSpend.value)}
              delta={data.kpis.actualSpend.deltaPercent}
              inverse
              accent
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
            />
            <Kpi
              label="Estimated API value"
              value={currency(data.kpis.estimatedApiCost.value)}
              delta={data.kpis.estimatedApiCost.deltaPercent}
              inverse
            />
            <Kpi
              label="Model calls"
              value={compactNumber(data.kpis.modelCalls.value)}
              delta={data.kpis.modelCalls.deltaPercent}
            />
          </div>

          <div className="mt-10">
            <section>
              <CycleSectionHeader view={data.cycleView} period={rollingPeriod} cycles={data.subscriptionCycles} />
              {data.subscriptionCycles.length ? (
                <ul className="divide-y">
                  {data.subscriptionCycles.map((row) => (
                    <li key={row.id} className="py-4">
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
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          className="h-1.5 min-w-0 flex-1 overflow-hidden bg-muted"
                          role="meter"
                          aria-label={
                            row.utilizationDisplayPercent != null
                              ? `${toolDisplayName(row.toolKey ?? row.toolName)} plan use ${row.utilizationDisplayPercent.toFixed(0)} percent`
                              : `${toolDisplayName(row.toolKey ?? row.toolName)} plan use waiting for quota signal`
                          }
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={
                            row.utilizationDisplayPercent != null
                              ? Math.round(row.utilizationDisplayPercent)
                              : undefined
                          }
                        >
                          <div
                            className={cn(
                              "h-full transition-[width]",
                              barToneForVerdict(row.verdictCode),
                            )}
                            style={{
                              width:
                                row.utilizationDisplayPercent != null
                                  ? `${Math.min(100, Math.max(2, row.utilizationDisplayPercent))}%`
                                  : "0%",
                            }}
                          />
                        </div>
                        {row.utilizationPercent != null ? (
                          <p
                            className={cn(
                              "shrink-0 text-xs font-semibold tabular-nums",
                              toneForVerdict(row.verdictCode),
                            )}
                          >
                            {row.utilizationPercent.toFixed(0)}%
                          </p>
                        ) : (
                          <p className="shrink-0 text-xs text-muted-foreground">—</p>
                        )}
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
                <p className="py-4 text-sm text-muted-foreground">Add subscriptions to see cycle utilization.</p>
              )}
            </section>
          </div>

          <div className="mt-10 grid gap-10 xl:grid-cols-[1.4fr_0.6fr]">
            <section>
              <div className="mb-4 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Model calls.</h2>
              </div>
              <OverviewChart data={data.trend} />
            </section>

            <section>
              <div className="mb-4 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Notifications.</h2>
              </div>
              {data.attention.length ? (
                <ul className="divide-y">
                  {data.attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40"
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
                <p className="py-4 text-sm text-muted-foreground">No notifications.</p>
              )}
            </section>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section>
              <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Tools.</h2>
                <Link href="/tools" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  All tools
                </Link>
              </div>
              {data.tools.length ? (
                <ul className="divide-y">
                  {data.tools.map((tool) => (
                    <li key={tool.name} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tool.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tool.activeDevelopers} active
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">{compactNumber(tool.requests)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{currency(tool.cost)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No tools detected yet.</p>
              )}
            </section>

            <section>
              <div className="mb-4 border-b pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Coverage.</h2>
              </div>
              <dl className="space-y-5">
                {[
                  {
                    label: `Active people (${ACTIVE_PEOPLE_WINDOW_DAYS}d)`,
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
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium tabular-nums">{row.value}</dd>
                    </div>
                    <div className="h-1.5 overflow-hidden bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {data.failures.length > 0 && (
            <section className="mt-10">
              <div className="mb-4 border-b border-destructive/30 pb-3">
                <h2 className="text-lg font-semibold tracking-tight">Failed requests.</h2>
              </div>
              <ul className="divide-y">
                {data.failures.map((failure) => (
                  <li key={failure.id} className="flex flex-wrap items-center gap-3 py-3">
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
