"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Plus, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { MobileDataCard, MobileDataField, MobileDataList } from "@/components/ui/mobile-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { HubTabList } from "@/components/hub-nav";
import { Panel } from "@/components/panel";
import { PageHeader } from "@/components/page-header";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { cn } from "@/lib/utils";
import { formatCompactNumber, formatMicrosAsCurrency } from "@/lib/format";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ApiCreditInventory } from "./api-credit-inventory";
import { ToolLogoTile } from "./tool-brand-icon";
import { aggregateTeamQuotas, teamQuotaSummaryLabel } from "@/lib/quotas/display";
import { canonicalToolKey, findCatalogTool, subscriptionToolKeys } from "@/lib/tools/catalog";
import type { DashboardToolsData } from "@/lib/queries/dashboard/tools";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, type RollingPeriod } from "@/lib/dashboard/period-prefs";

const toolsViews = [
  { id: "subscriptions", label: "Subscriptions" },
  { id: "api_credits", label: "API Credits" },
  { id: "activity", label: "Activity" },
] as const;

type ToolsView = (typeof toolsViews)[number]["id"];

type CatalogTool = {
  key: string;
  name: string;
  shortName: string;
  aliases: readonly string[];
  sourceUrl: string;
  lastVerifiedAt: string;
  plans: Array<{
    key: string;
    name: string;
    tier: string;
    description: string;
    prices: Partial<Record<"weekly" | "monthly" | "annual" | "custom", string>>;
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
  billingCadence: string;
  seatCapacity: number;
  cycleSeatMicros: string | bigint;
  estimatedCycleMicros: string | bigint;
  assignedSeats: number;
  availableSeats: number;
  customPrice: boolean;
  active: boolean;
};

function matchesCatalogTool(subscriptionToolKey: string | null, catalogToolKey: string) {
  if (!subscriptionToolKey) return false;
  return (subscriptionToolKeys(catalogToolKey) as readonly string[]).includes(subscriptionToolKey);
}

export function SubscriptionInventory({
  detected,
  initialCatalog,
  initialSubscriptions,
  defaultTab = "subscriptions",
  hasLocalSync = false,
  title = "Tools, seats, spend.",
  description = "Manage team subscriptions and compare purchased seats with usage and quotas.",
  cycleView = "current_cycles",
  period = DEFAULT_ROLLING_PERIOD,
  periodSuffix = "current",
  periodBasePath = "/tools",
  children,
}: {
  detected: DashboardToolsData | null;
  initialCatalog?: CatalogTool[];
  initialSubscriptions?: Subscription[];
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
  const [catalog, setCatalog] = useState<CatalogTool[]>(initialCatalog ?? []);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions ?? []);
  const [loading, setLoading] = useState(initialSubscriptions === undefined);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addToolKey, setAddToolKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Catalog data is static and arrives in the client bundle. Refresh only
    // the mutable subscription list after a successful mutation.
    const subscriptionsRes = await fetch("/api/tools/subscriptions");
    const subscriptionsJson = await subscriptionsRes.json().catch(() => ({}));
    if (!subscriptionsRes.ok) {
      setError(subscriptionsJson.error ?? "Could not load subscriptions");
    } else {
      setSubscriptions(subscriptionsJson.subscriptions ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialCatalog) setCatalog(initialCatalog);
    if (initialSubscriptions) {
      setSubscriptions(initialSubscriptions);
      setLoading(false);
    }
  }, [initialCatalog, initialSubscriptions]);

  const groups = useMemo(
    () =>
      catalog
        .map((tool) => ({
          tool,
          subscriptions: subscriptions.filter((subscription) =>
            matchesCatalogTool(subscription.toolKey, tool.key),
          ),
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
      <PageHeader
        title={title}
        description={description}
        actions={
          <HubTabList
            items={[...toolsViews]}
            value={view}
            onChange={(id) => setView(id as ToolsView)}
            className="border-b border-border"
            aria-label="Tools views"
          />
        }
      >
        {children}
      </PageHeader>

      {view === "subscriptions" ? (
        <div className="space-y-10">
          <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
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
              value={formatMicrosAsCurrency(totals.cycle)}
              sub="Current cycles"
            />
          </div>

          <Panel as="section">
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
              <Alert variant="destructive" className="mb-4 rounded-none">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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
                            {formatMicrosAsCurrency(cycle)}
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
          </Panel>
        </div>
      ) : view === "api_credits" ? (
        <ApiCreditInventory />
      ) : (
        <ActivityPanel
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

function ActivityPanel({
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
    requests: tools.reduce((sum, tool) => sum + tool.requests, 0),
    inputTokens: tools.reduce((sum, tool) => sum + tool.inputTokens, 0),
    outputTokens: tools.reduce((sum, tool) => sum + tool.outputTokens, 0),
    cost: tools.reduce((sum, tool) => sum + tool.cost, 0),
  };
  const periodLabel = periodSuffix.charAt(0).toUpperCase() + periodSuffix.slice(1);

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <CycleViewPicker view={cycleView} period={period} basePath={periodBasePath} />
      </div>

      <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Requests"
          hero
          className="pl-5"
          value={totals.requests.toLocaleString()}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Input tokens"
          className="sm:border-l sm:border-border sm:pl-8"
          value={formatCompactNumber(totals.inputTokens)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Output tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={formatCompactNumber(totals.outputTokens)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Usage cost"
          className="sm:border-l sm:border-border sm:pl-8"
          value={`$${totals.cost.toFixed(2)}`}
          sub={periodLabel}
        />
      </div>

      {!tools.length ? (
        <Panel as="section">
          <Empty className="min-h-0 gap-2 border-0 py-10 md:py-10">
            <EmptyTitle className="text-base">No activity yet</EmptyTitle>
            <EmptyDescription>
              Requests, tokens, and usage cost appear here after developers enroll the command-line agent.
            </EmptyDescription>
          </Empty>
        </Panel>
      ) : (
        <Panel as="section">
          <SignalsSectionHeader
            title="Activity."
            description="Requests, tokens, and cost by tool. Plan use is averaged across people — open a tool for per-person windows."
            bordered
          />
          <MobileDataList>
            {tools.map((tool) => {
              const toolKey = canonicalToolKey(tool.toolName);
              const catalogTool = findCatalogTool(toolKey);
              const href = catalogTool ? `/tools/${catalogTool.key}` : null;
              const content = (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <ToolLogoTile tool={tool.toolName} size="sm" />
                    <p className="truncate text-sm font-medium capitalize">{tool.toolName.replaceAll("-", " ")}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    <MobileDataField label={`Requests (${periodSuffix})`} value={tool.requests.toLocaleString()} />
                    <MobileDataField label={`Cost (${periodSuffix})`} value={`$${tool.cost.toFixed(2)}`} />
                    <MobileDataField label="Input" value={formatCompactNumber(tool.inputTokens)} />
                    <MobileDataField label="Output" value={formatCompactNumber(tool.outputTokens)} />
                    <MobileDataField className="col-span-2" label="Plan use" value={<TeamQuotaCell quotas={tool.quotas} />} />
                  </dl>
                </>
              );

              return (
                <MobileDataCard key={tool.toolName}>
                  {href ? (
                    <Link href={href} className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {content}
                      <span className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
                        Open <ChevronRight className="size-4" />
                      </span>
                    </Link>
                  ) : content}
                </MobileDataCard>
              );
            })}
          </MobileDataList>
          <Table containerClassName="hidden md:block" className="min-w-[840px] text-left text-sm">
            <TableHeader className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              <TableRow>
                <TableHead className="pb-3 pr-4 pt-1 font-medium">Tool</TableHead>
                <TableHead className="pb-3 pr-4 pt-1 text-right font-medium">Requests ({periodSuffix})</TableHead>
                <TableHead className="pb-3 pr-4 pt-1 text-right font-medium">Input ({periodSuffix})</TableHead>
                <TableHead className="pb-3 pr-4 pt-1 text-right font-medium">Output ({periodSuffix})</TableHead>
                <TableHead className="pb-3 pr-4 pt-1 text-right font-medium">Cost ({periodSuffix})</TableHead>
                <TableHead className="pb-3 pr-4 pt-1 text-right font-medium">Plan use</TableHead>
                <TableHead className="pb-3 pt-1 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => {
                const toolKey = canonicalToolKey(tool.toolName);
                const catalogTool = findCatalogTool(toolKey);
                const href = catalogTool ? `/tools/${catalogTool.key}` : null;

                return (
                  <TableRow
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
                    <TableCell className="py-5 pr-4">
                      <div className="flex items-center gap-3">
                        <ToolLogoTile tool={tool.toolName} size="sm" />
                        <span className="font-medium capitalize">{tool.toolName.replaceAll("-", " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 pr-4 text-right tabular-nums">{tool.requests.toLocaleString()}</TableCell>
                    <TableCell className="py-5 pr-4 text-right tabular-nums">{formatCompactNumber(tool.inputTokens)}</TableCell>
                    <TableCell className="py-5 pr-4 text-right tabular-nums">{formatCompactNumber(tool.outputTokens)}</TableCell>
                    <TableCell className="py-5 pr-4 text-right tabular-nums">${tool.cost.toFixed(2)}</TableCell>
                    <TableCell className="py-5 pr-4 text-right">
                      <TeamQuotaCell quotas={tool.quotas} />
                    </TableCell>
                    <TableCell
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
