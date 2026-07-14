"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ToolLogoTile } from "./tool-brand-icon";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";
import type { DashboardToolsData } from "@/lib/queries/dashboard/tools";
import { cn } from "@/lib/utils";

type Cadence = "monthly" | "annual" | "custom";
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
    includedMonthlyMicros: string;
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
  monthlySeatMicros: string;
  estimatedMonthlyMicros: string;
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
}: {
  detected: DashboardToolsData | null;
  defaultTab?: "subscriptions" | "activity";
  hasLocalSync?: boolean;
}) {
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
      monthly: subscriptions.reduce((sum, item) => sum + BigInt(item.estimatedMonthlyMicros), BigInt(0)),
    }),
    [groups.length, subscriptions],
  );

  function openAdd(toolKey?: string) {
    setAddToolKey(toolKey ?? null);
    setError(null);
    setAddOpen(true);
  }

  return (
    <Tabs defaultValue={defaultTab} className="gap-8">
      <TabsList
        variant="line"
        aria-label="Tools views"
        className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0"
      >
        <TabsTrigger
          value="subscriptions"
          className="rounded-none border-0 px-0 pb-3 shadow-none data-[state=active]:border-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          Subscriptions
        </TabsTrigger>
        <TabsTrigger
          value="activity"
          className="rounded-none border-0 px-0 pb-3 shadow-none data-[state=active]:border-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          Detected activity
        </TabsTrigger>
      </TabsList>

      <TabsContent value="subscriptions">
        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Active tools", totals.tools],
              ["Purchased seats", totals.purchased],
              ["Available seats", totals.available],
              ["Monthly subscription cost", money(totals.monthly)],
            ] as const
          ).map(([label, value], index) => (
            <div
              key={String(label)}
              className={cn(
                "pl-4",
                index === 3
                  ? "border-l-2 border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4"
                  : "border-l-2 border-border-strong",
              )}
            >
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {index === 0
                  ? "Configured subscriptions"
                  : index === 1
                    ? "Across every plan"
                    : index === 2
                      ? "Ready to assign"
                      : "Estimated monthly"}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 mb-4 flex items-end justify-between gap-4 pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Company tools.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Plans your team can assign to developers.</p>
          </div>
          <Button size="sm" onClick={() => openAdd()}>
            <Plus /> Add tool
          </Button>
        </div>
        {error && (
          <div role="alert" className="mb-4 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading subscriptions
          </div>
        ) : groups.length ? (
          <div className="divide-y">
            {groups.map(({ tool, subscriptions: items }) => {
              const purchased = items.reduce((sum, item) => sum + item.seatCapacity, 0);
              const assigned = items.reduce((sum, item) => sum + item.assignedSeats, 0);
              const monthly = items.reduce((sum, item) => sum + BigInt(item.estimatedMonthlyMicros), BigInt(0));
              const summary = items.map((item) => `${item.seatCapacity} ${item.name}`).join(" · ");
              return (
                <Link
                  key={tool.key}
                  href={`/tools/${tool.key}`}
                  className="group grid w-full gap-5 py-5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/40 md:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ToolLogoTile tool={tool.key} size="lg" />
                    <div className="min-w-0">
                      <h3 className="font-semibold">{tool.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{summary}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm tabular-nums">
                    <div>
                      <span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Seats
                      </span>
                      {assigned} / {purchased}
                    </div>
                    <div>
                      <span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Available
                      </span>
                      {purchased - assigned}
                    </div>
                    <div>
                      <span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Monthly
                      </span>
                      {money(monthly)}
                    </div>
                  </div>
                  <ChevronRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 md:block" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
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
            <Button className="mt-5" onClick={() => openAdd()}>
              <Plus /> Add tool
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="activity">
        <DetectedActivity data={detected} />
      </TabsContent>

      <AddSubscriptionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        initialToolKey={addToolKey}
        onCreated={load}
      />
    </Tabs>
  );
}

function QuotaChips({
  quotas,
}: {
  quotas: DashboardToolsData["tools"][number]["quotas"];
}) {
  if (!quotas?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {quotas.slice(0, 8).map((quota) => (
        <span
          key={`${quota.toolName}-${quota.windowType}-${quota.deviceHostname ?? "org"}`}
          className="border bg-muted/40 px-2 py-1 font-mono text-[0.65rem] text-muted-foreground"
          title={
            quota.deviceHostname
              ? `${quota.developerName ?? "Developer"} · ${quota.deviceHostname}`
              : undefined
          }
        >
          {quota.toolName} {quota.windowType}
          {quota.usedPercent != null ? ` ${quota.usedPercent.toFixed(0)}%` : ""}
          {quota.resetAt ? ` · resets ${new Date(quota.resetAt).toLocaleDateString()}` : ""}
        </span>
      ))}
    </div>
  );
}

function DetectedActivity({ data }: { data: DashboardToolsData | null }) {
  if (!data?.tools.length) {
    return (
      <div className="px-6 py-14 text-center">
        <h3 className="font-medium">No tool activity detected yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Activity and quota windows appear here after developers enroll the command-line agent.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(90px,1fr))] gap-4 px-1 py-3 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span>Tool</span>
          <span>Devices</span>
          <span>Requests (7d)</span>
          <span>Tokens (7d)</span>
          <span>Cost (7d)</span>
        </div>
        <div className="divide-y">
          {data.tools.map((tool) => {
            const toolKey = canonicalToolKey(tool.toolName);
            const catalogTool = findCatalogTool(toolKey);
            const row = (
              <>
                <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(90px,1fr))] items-center gap-4 text-sm tabular-nums">
                  <div className="flex items-center gap-3">
                    <ToolLogoTile tool={tool.toolName} size="sm" />
                    <span className="font-medium capitalize">{tool.toolName.replaceAll("-", " ")}</span>
                  </div>
                  <span>{tool.installedOn}</span>
                  <span>{tool.requests7d.toLocaleString()}</span>
                  <span>{tool.tokens7d.toLocaleString()}</span>
                  <span>${tool.cost7d.toFixed(2)}</span>
                </div>
                <QuotaChips quotas={tool.quotas} />
              </>
            );

            if (!catalogTool) {
              return (
                <div key={tool.toolName} className="px-1 py-4">
                  {row}
                </div>
              );
            }

            return (
              <Link
                key={tool.toolName}
                href={`/tools/${catalogTool.key}`}
                className="block px-1 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                {row}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
