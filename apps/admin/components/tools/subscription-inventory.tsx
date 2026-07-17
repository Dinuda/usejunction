"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Plus, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { cn } from "@/lib/utils";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ToolLogoTile } from "./tool-brand-icon";
import { aggregateTeamQuotas, teamQuotaSummaryLabel } from "@/lib/quotas/display";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";
import type { DashboardToolsData } from "@/lib/queries/dashboard/tools";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, type RollingPeriod } from "@/lib/dashboard/period-prefs";

const toolsViews = [
  ["subscriptions", "Subscriptions"],
  ["activity", "Detected activity"],
] as const;

type ToolsView = (typeof toolsViews)[number][0];

type Cadence = "weekly" | "monthly" | "annual" | "custom";
type CatalogTool = {
  key: string;
  name: string;
  shortName: string;
  aliases: string[];
  sourceUrl: string;
  lastVerifiedAt: string;
  plans: Array<{
    key: string;
    name: string;
    tier: string;
    description: string;
    prices: Partial<Record<Cadence, string>>;
    includedCycleMicros: string;
    customPrice?: boolean;
    minimumSeats?: number;
  }>;
};
type Subscription = {
  id: string;
  toolKey: string | null;
  catalogPlanKey: string | null;
  name: string;
  tier: string | null;
  billingCadence: Cadence;
  seatCapacity: number;
  cycleSeatMicros: string;
  estimatedCycleMicros: string;
  assignedSeats: number;
  availableSeats: number;
  customPrice: boolean;
  active: boolean;
};

const money = (micros: string | bigint, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(BigInt(micros)) / 1_000_000);

export function SubscriptionInventory({
  detected,
  defaultTab = "subscriptions",
  hasLocalSync = false,
  title = "Tools, seats, spend.",
  description = "Manage team subscriptions and compare purchased seats with detected activity and quotas.",
  cycleView = "current_cycles",
  period = DEFAULT_ROLLING_PERIOD,
  periodSuffix = "current",
  periodBasePath = "/tools",
  children,
}: {
  detected: DashboardToolsData | null;
  defaultTab?: ToolsView;
  hasLocalSync?: boolean;
  title?: string;
  description?: string;
  cycleView?: CycleView;
  period?: RollingPeriod;
  periodSuffix?: string;
  periodBasePath?: string;
  children?: ReactNode;
}) {
  const [view, setView] = useState<ToolsView>(defaultTab);
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addToolKey, setAddToolKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [catalogRes, subscriptionsRes] = await Promise.all([
      fetch("/api/tools/catalog"),
      fetch("/api/tools/subscriptions"),
    ]);
    const catalogJson = await catalogRes.json().catch(() => ({}));
    const subscriptionsJson = await subscriptionsRes.json().catch(() => ({}));
    if (!catalogRes.ok || !subscriptionsRes.ok) {
      setError(catalogJson.error ?? subscriptionsJson.error ?? "Could not load subscriptions");
    } else {
      setCatalog(catalogJson.tools ?? []);
      setSubscriptions(subscriptionsJson.subscriptions ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () =>
      catalog
        .map((tool) => ({
          tool,
          subscriptions: subscriptions.filter((subscription) => subscription.toolKey === tool.key),
        }))
        .filter((group) => group.subscriptions.length > 0),
    [catalog, subscriptions],
  );
  const totals = useMemo(
    () => ({
      tools: groups.length,
      purchased: subscriptions.reduce((sum, item) => sum + item.seatCapacity, 0),
      available: subscriptions.reduce((sum, item) => sum + item.availableSeats, 0),
      cycle: subscriptions.reduce((sum, item) => sum + BigInt(item.estimatedCycleMicros), BigInt(0)),
    }),
    [groups.length, subscriptions],
  );

  function openAdd(toolKey?: string) {
    setAddToolKey(toolKey ?? null);
    setError(null);
    setAddOpen(true);
  }

  return (
    <>
      <header className="mb-10 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="shrink-0 sm:pb-0.5">
            <nav
              className="flex flex-wrap items-stretch justify-end gap-0 border-b border-border"
              aria-label="Tools views"
              role="tablist"
            >
              {toolsViews.map(([value, label]) => {
                const active = view === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(value)}
                    className={cn(
                      "relative -mb-px px-3.5 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-muted font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-foreground"
                        : "font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        {children}
      </header>

      {view === "subscriptions" ? (
        <div className="space-y-10">
          <div className="grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            <SignalsKpi
              label="Active tools"
              hero
              className="pl-5"
              value={totals.tools}
              sub="Configured subscriptions"
            />
            <SignalsKpi
              label="Purchased seats"
              className="sm:border-l sm:border-border sm:pl-8"
              value={totals.purchased}
              sub="Across every plan"
            />
            <SignalsKpi
              label="Available seats"
              className="xl:border-l xl:border-border xl:pl-8"
              value={totals.available}
              sub="Ready to assign"
            />
            <SignalsKpi
              label="Subscription cycle cost"
              className="sm:border-l sm:border-border sm:pl-8"
              value={money(totals.cycle)}
              sub="Current cycles"
            />
          </div>

          <section className="border bg-card p-5">
            <SignalsSectionHeader
              title="Company tools."
              description="Plans your team can assign to developers."
              bordered
              action={
                <Button size="sm" className="rounded-none" onClick={() => openAdd()}>
                  <Plus /> Add tool
                </Button>
              }
            />
            {error ? (
              <div role="alert" className="mb-4 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            {loading ? (
              <div className="flex min-h-48 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Loading subscriptions
              </div>
            ) : groups.length ? (
              <ul>
                {groups.map(({ tool, subscriptions: items }) => {
                  const purchased = items.reduce((sum, item) => sum + item.seatCapacity, 0);
                  const assigned = items.reduce((sum, item) => sum + item.assignedSeats, 0);
                  const cycle = items.reduce((sum, item) => sum + BigInt(item.estimatedCycleMicros), BigInt(0));
                  const summary = items.map((item) => `${item.seatCapacity} ${item.name}`).join(" · ");
                  return (
                    <li key={tool.key}>
                      <Link
                        href={`/tools/${tool.key}`}
                        className="group grid w-full gap-5 py-5 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/40 md:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)_auto] md:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ToolLogoTile tool={tool.key} size="lg" />
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold tracking-tight">{tool.name}</h3>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{summary}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm tabular-nums">
                          <div>
                            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              Seats
                            </span>
                            {assigned} / {purchased}
                          </div>
                          <div>
                            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              Available
                            </span>
                            {purchased - assigned}
                          </div>
                          <div>
                            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              Cycle cost
                            </span>
                            {money(cycle)}
                          </div>
                        </div>
                        <span
                          aria-hidden
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "rounded-none justify-self-start pointer-events-none md:justify-self-end",
                          )}
                        >
                          Open
                          <ChevronRight />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-2 py-10 text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center bg-muted/40">
                  <Users className="size-5" />
                </div>
                <h3 className="font-medium">
                  {detected?.tools.some((tool) => tool.installedOn > 0)
                    ? hasLocalSync
                      ? "No seats yet"
                      : "Waiting for plan reports"
                    : "Add your first team tool"}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {detected?.tools.some((tool) => tool.installedOn > 0)
                    ? hasLocalSync
                      ? "Use Sync now above to pull plans from this machine, or wait for teammates' agents to report vendor plans."
                      : "Detected tools need a vendor plan from a connected agent before seats appear. Open this page on a linked machine or wait for the next agent report."
                    : "Choose a familiar plan and tell us how many seats you own. Pricing and provider details are filled in for you."}
                </p>
                <Button className="mt-5 rounded-none" onClick={() => openAdd()}>
                  <Plus /> Add tool
                </Button>
              </div>
            )}
          </section>
        </div>
      ) : (
        <DetectedActivity
          data={detected}
          cycleView={cycleView}
          period={period}
          periodSuffix={periodSuffix}
          periodBasePath={periodBasePath}
        />
      )}

      <AddSubscriptionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        initialToolKey={addToolKey}
        onCreated={load}
      />
    </>
  );
}

function TeamQuotaCell({
  quotas,
}: {
  quotas: DashboardToolsData["tools"][number]["quotas"];
}) {
  const aggregate = aggregateTeamQuotas(quotas ?? []);
  if (!aggregate) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className="text-xs tabular-nums text-muted-foreground"
      title="Average of each person's primary quota window. Open the tool for per-person limits."
    >
      {teamQuotaSummaryLabel(aggregate)}
    </span>
  );
}

function DetectedActivity({
  data,
  cycleView,
  period,
  periodSuffix,
  periodBasePath,
}: {
  data: DashboardToolsData | null;
  cycleView: CycleView;
  period: RollingPeriod;
  periodSuffix: string;
  periodBasePath: string;
}) {
  const router = useRouter();
  const tools = data?.tools ?? [];
  const totals = {
    tools: tools.length,
    devices: tools.reduce((sum, tool) => sum + tool.installedOn, 0),
    requests: tools.reduce((sum, tool) => sum + tool.requests, 0),
    cost: tools.reduce((sum, tool) => sum + tool.cost, 0),
  };
  const periodLabel = periodSuffix.charAt(0).toUpperCase() + periodSuffix.slice(1);

  return (
    <div className="space-y-10">
      <div className="grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Detected tools"
          hero
          className="pl-5"
          value={totals.tools}
          sub="From enrolled agents"
        />
        <SignalsKpi
          label="Devices"
          className="sm:border-l sm:border-border sm:pl-8"
          value={totals.devices}
          sub="Installs across tools"
        />
        <SignalsKpi
          label="Requests"
          className="xl:border-l xl:border-border xl:pl-8"
          value={totals.requests.toLocaleString()}
          sub={periodLabel}
          action={<MetricPeriodFilter view={cycleView} period={period} basePath={periodBasePath} />}
        />
        <SignalsKpi
          label="Usage cost"
          className="sm:border-l sm:border-border sm:pl-8"
          value={`$${totals.cost.toFixed(2)}`}
          sub={periodLabel}
        />
      </div>

      {!tools.length ? (
        <section className="border bg-card p-5">
          <div className="py-10 text-center">
            <h3 className="font-medium">No tool activity detected yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Activity and quota windows appear here after developers enroll the command-line agent.
            </p>
          </div>
        </section>
      ) : (
        <section className="border bg-card p-5">
          <SignalsSectionHeader
            title="Detected activity."
            description="Observed installs and traffic. Plan use is averaged across people — open a tool for per-person windows."
            bordered
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="pb-3 pr-4 pt-1 font-medium">Tool</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Devices</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Requests ({periodSuffix})</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Tokens ({periodSuffix})</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Cost ({periodSuffix})</th>
                  <th className="pb-3 pr-4 pt-1 text-right font-medium">Plan use</th>
                  <th className="pb-3 pt-1 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => {
                  const toolKey = canonicalToolKey(tool.toolName);
                  const catalogTool = findCatalogTool(toolKey);
                  const href = catalogTool ? `/tools/${catalogTool.key}` : null;

                  return (
                    <tr
                      key={tool.toolName}
                      className={cn(
                        "transition-colors",
                        href &&
                          "cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                      )}
                      tabIndex={href ? 0 : undefined}
                      onClick={href ? () => router.push(href) : undefined}
                      onKeyDown={
                        href
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(href);
                              }
                            }
                          : undefined
                      }
                    >
                      <td className="py-5 pr-4">
                        <div className="flex items-center gap-3">
                          <ToolLogoTile tool={tool.toolName} size="sm" />
                          <span className="font-medium capitalize">{tool.toolName.replaceAll("-", " ")}</span>
                        </div>
                      </td>
                      <td className="py-5 pr-4 text-right tabular-nums">{tool.installedOn}</td>
                      <td className="py-5 pr-4 text-right tabular-nums">{tool.requests.toLocaleString()}</td>
                      <td className="py-5 pr-4 text-right tabular-nums">{tool.tokens.toLocaleString()}</td>
                      <td className="py-5 pr-4 text-right tabular-nums">${tool.cost.toFixed(2)}</td>
                      <td className="py-5 pr-4 text-right">
                        <TeamQuotaCell quotas={tool.quotas} />
                      </td>
                      <td
                        className="py-5 text-right"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {href ? (
                          <Button variant="outline" size="sm" className="rounded-none" asChild>
                            <Link href={href}>
                              Open
                              <ChevronRight />
                            </Link>
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
