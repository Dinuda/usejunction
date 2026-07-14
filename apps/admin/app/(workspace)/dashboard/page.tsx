import Link from "next/link";
import { ArrowUpRight, CircleAlert } from "lucide-react";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { ConnectMachineBanner } from "@/components/dashboard/connect-machine-banner";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { DashboardSetupPanel } from "@/components/dashboard/setup-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  ACTIVE_PEOPLE_WINDOW_DAYS,
  getOrgOverview,
  overviewInputFromRange,
  type OrgOverviewV1,
} from "@/lib/insights";
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
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", good ? "text-success" : "text-destructive")}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(0)}%
    </span>
  );
}

type DashboardRange = OrgOverviewV1["range"];

function RangePicker({ range }: { range: DashboardRange }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-card p-1" aria-label="Date range">
      {([7, 30, 90] as DashboardRange[]).map((value) => (
        <Button key={value} asChild size="sm" variant="ghost">
          <Link
            href={`/dashboard?range=${value}`}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.08em]",
              range === value
                ? "!bg-secondary !text-foreground hover:!bg-secondary hover:!text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {value}d
          </Link>
        </Button>
      ))}
    </div>
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
      {delta !== undefined && (
        <div className="mt-2">
          <Delta value={delta} inverse={inverse} />
        </div>
      )}
    </div>
  );
}

function actualSpendSub(kpi: { basis: "subscriptions" | "none" }) {
  if (kpi.basis === "none") return "no monthly coding subscriptions";
  return "full monthly subscription cost";
}

function observedDaysSub(observation: {
  partialWindow: boolean;
  daysWithActivity: number;
  rangeDays: number;
  firstActivityDate: string | null;
}) {
  if (observation.partialWindow) {
    if (observation.firstActivityDate) {
      return `observed · ${observation.daysWithActivity}/${observation.rangeDays}d from ${observation.firstActivityDate}`;
    }
    return `observed · ${observation.daysWithActivity}/${observation.rangeDays}d`;
  }
  return "observed";
}

function estimatedApiSub(observation: {
  partialWindow: boolean;
  daysWithActivity: number;
  rangeDays: number;
}) {
  if (observation.partialWindow) {
    return `rate-card · ${observation.daysWithActivity}/${observation.rangeDays}d observed`;
  }
  return "rate-card on observed usage";
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
              needsPlanSync={data.sync.needsPlanSync}
              autoAttempt
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    return <PersonalHome data={personal} />;
  }

  const params = await searchParams;
  const range = params.range === "7" || params.range === "90" ? (Number(params.range) as DashboardRange) : 30;
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
      overviewInputFromRange(range),
    );
    data = envelope.data;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not load dashboard.";
  }

  const empty = data && !data.hasActivity && data.coverage.devices === 0;
  const myDeveloper = await prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    select: { id: true, _count: { select: { devices: true } } },
  });
  const needsPersonalConnect = !myDeveloper || myDeveloper._count.devices === 0;

  return (
    <>
      <ConnectMachineBanner show={needsPersonalConnect} />
      <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
            {empty ? "Nothing reporting yet." : "Spend, traffic, coverage."}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {empty
              ? "Connect a machine, then invite people. Metrics show up as soon as the first request lands."
              : `Last ${range} days through today across tools and developers.`}
          </p>
        </div>
        {!empty && data && <RangePicker range={range} />}
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard?range=${range}`}>Retry</Link>
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
              label="Actual spend"
              value={currency(data.kpis.actualSpend.value)}
              delta={data.kpis.actualSpend.deltaPercent}
              inverse
              accent
              sub={actualSpendSub(data.kpis.actualSpend)}
            />
            <Kpi
              label="Verified usage"
              value={currency(data.kpis.verifiedUsageCost.value)}
              delta={data.kpis.verifiedUsageCost.deltaPercent}
              inverse
              sub="vendor-reported charges"
            />
            <Kpi
              label="Estimated API value"
              value={currency(data.kpis.estimatedApiCost.value)}
              delta={data.kpis.estimatedApiCost.deltaPercent}
              inverse
              sub={estimatedApiSub(data.observation)}
            />
            <Kpi
              label="Model calls"
              value={compactNumber(data.kpis.modelCalls.value)}
              delta={data.kpis.modelCalls.deltaPercent}
              sub={observedDaysSub(data.observation)}
            />
          </div>
          {data.planUsageSummary &&
          (data.planUsageSummary.nearLimitCount > 0 ||
            data.planUsageSummary.avgUtilizationPercent != null) ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Plan seats {data.planUsageSummary.assignedSeats}/{data.planUsageSummary.seatCapacity}
              {data.planUsageSummary.avgUtilizationPercent != null
                ? ` · avg utilization ${data.planUsageSummary.avgUtilizationPercent.toFixed(0)}%`
                : ""}
              {data.planUsageSummary.nearLimitCount > 0
                ? ` · ${data.planUsageSummary.nearLimitCount} near limit`
                : ""}
              {" · "}
              <Link href="/team" className="underline-offset-4 hover:text-foreground hover:underline">
                View roster
              </Link>
            </p>
          ) : null}

          <div className="mt-10 grid gap-10 xl:grid-cols-[1.4fr_0.6fr]">
            <section>
              <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Model calls.</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Solid = this period · dashed = prior</p>
                </div>
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
