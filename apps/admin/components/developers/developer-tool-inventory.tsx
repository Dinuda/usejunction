"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronDown, ChevronUp, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddSubscriptionSheet } from "@/components/tools/add-subscription-sheet";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { RosterPlanUsage, type RosterPlanUsagePlan } from "@/components/developers/roster-plan-usage";
import { SubscriptionChoices, toolLabel } from "@/components/developers/member-plans-panel";
import { isDeviceOnline } from "@/lib/devices/presence";
import type { PlanUsageDeveloperRow } from "@/lib/insights/contracts/plan-usage.v1";

type Subscription = {
  id: string;
  toolKey: string | null;
  name: string;
  tier: string | null;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
  billingCadence: string;
  cycleSeatMicros: string;
  estimatedCycleMicros: string;
};
type ManualPlan = {
  id: string;
  planTemplateId: string;
  toolName: string;
  planName: string;
  planTier: string | null;
  seatCount: number;
  seatStatus: string;
  startDate: string;
  endDate: string | null;
  cycleSeatMicros: string;
  vendorAccountEmail: string | null;
  template: { toolKey: string | null; catalogPlanKey: string | null };
};
type Developer = {
  id: string;
  name: string;
  email: string;
  role: string;
  requests: number;
  devices: Array<{
    id: string;
    hostname?: string;
    status?: string;
    lastSeenAt?: string;
    toolInstallations: Array<{ toolName: string }>;
  }>;
  toolEvidence: Array<{ toolName: string }>;
  manualPlans: ManualPlan[];
};

const utcToday = () => new Date().toISOString().slice(0, 10);

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function planUsageMap(rows: PlanUsageDeveloperRow[]) {
  return new Map(rows.map((developer) => [developer.developerId, developer]));
}

export function DeveloperToolInventory({
  showSummary = true,
  initialDevelopers,
  initialSubscriptions,
  initialPlanUsage,
  periodSuffix = "30d",
}: {
  showSummary?: boolean;
  initialDevelopers: Developer[];
  initialSubscriptions: Subscription[];
  initialPlanUsage: PlanUsageDeveloperRow[];
  periodSuffix?: string;
}) {
  const router = useRouter();
  const [developers, setDevelopers] = useState<Developer[]>(initialDevelopers);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addSubscriptionOpen, setAddSubscriptionOpen] = useState(false);
  const [planUsageByDeveloper, setPlanUsageByDeveloper] = useState(() => planUsageMap(initialPlanUsage));

  useEffect(() => {
    setDevelopers(initialDevelopers);
    setSubscriptions(initialSubscriptions);
    setPlanUsageByDeveloper(planUsageMap(initialPlanUsage));
  }, [initialDevelopers, initialSubscriptions, initialPlanUsage]);

  const configured = developers.filter((developer) => developer.manualPlans.length > 0).length;
  const unassignedActivity = developers.filter(
    (developer) => detectedTools(developer).length > 0 && developer.manualPlans.length === 0,
  ).length;
  const availableSeats = subscriptions.reduce((sum, subscription) => sum + subscription.availableSeats, 0);
  const canBulkAssign = developers.length > 1 && subscriptions.some((subscription) => subscription.availableSeats > 0);

  async function assignBulk(subscription: Subscription) {
    const ids = [...selected];
    setSaving(`bulk:${subscription.id}`);
    setError(null);
    const response = await fetch("/api/billing/assignments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        developerIds: ids,
        assignment: {
          planTemplateId: subscription.id,
          startDate: utcToday(),
          seatCount: 1,
          seatStatus: "active",
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Could not assign subscription");
    else {
      setSelected(new Set());
      setBulkOpen(false);
      router.refresh();
    }
    setSaving(null);
  }

  return (
    <div className="space-y-10">
      {showSummary ? (
        <div className="grid gap-y-8 sm:grid-cols-3">
          <div className="pl-5">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">People covered</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {configured}/{developers.length}
            </p>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-8">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Seats available</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{availableSeats}</p>
          </div>
          <div className="sm:border-l sm:border-border sm:pl-8">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Needs a plan</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{unassignedActivity}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="border bg-card">
        <div className="border-b bg-muted/25 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Team members.</h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {developers.length
              ? `${developers.length} on the roster · open anyone for plans, machines, and usage`
              : "Invite people, then assign plans from their profile."}
          </p>
        </div>

        <div className="px-5">
          {canBulkAssign && selected.size > 0 ? (
            <div className="mt-4 mb-1 flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3">
              <div className="mr-auto flex items-center gap-2 text-sm font-medium">
                <Users className="size-4" />
                {selected.size} selected
              </div>
              <div className="relative">
                <Button size="sm" className="rounded-none" onClick={() => setBulkOpen(!bulkOpen)}>
                  Assign plan {bulkOpen ? <ChevronUp /> : <ChevronDown />}
                </Button>
                {bulkOpen ? (
                  <div className="absolute right-0 top-10 z-20 w-80 border bg-popover p-2 shadow-lg">
                    <SubscriptionChoices
                      subscriptions={subscriptions.filter((subscription) => subscription.availableSeats > 0)}
                      requested={selected.size}
                      saving={saving}
                      onSelect={assignBulk}
                      onAddSubscription={() => setAddSubscriptionOpen(true)}
                    />
                  </div>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" className="rounded-none" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}

          {!developers.length ? (
            <p className="py-6 text-sm text-muted-foreground">
              Invite people, then open their profile to assign plans.
            </p>
          ) : (
            <ul className="divide-y">
              {developers.map((developer) => {
                const online = developer.devices.filter((device) => {
                  if (device.lastSeenAt) return isDeviceOnline(device.lastSeenAt);
                  return device.status === "online";
                }).length;
                const machineCount = developer.devices.length;
                const meta = [
                  machineCount ? `${online}/${machineCount} online` : "No machines",
                  developer.requests > 0 ? `${compact(developer.requests)} requests · ${periodSuffix}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const planUsage = planUsageByDeveloper.get(developer.id);
                const rosterPlans: RosterPlanUsagePlan[] =
                  planUsage?.plans.map((plan) => ({
                    toolName: plan.toolName,
                    toolKey: plan.toolKey,
                    planName: plan.planName,
                    primaryRatio: plan.primaryRatio,
                    verdict: plan.verdict,
                  })) ?? [];

                return (
                  <li key={developer.id}>
                    <div className="flex items-start gap-3">
                      {canBulkAssign ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${developer.name}`}
                          checked={selected.has(developer.id)}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              event.target.checked ? next.add(developer.id) : next.delete(developer.id);
                              return next;
                            })
                          }
                          className="mt-6 size-4 shrink-0 rounded border-input accent-primary"
                        />
                      ) : null}
                      <Link
                        href={`/team/${developer.id}`}
                        className="group grid min-w-0 flex-1 gap-4 py-5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/40 lg:grid-cols-[minmax(18rem,1fr)_minmax(16rem,auto)] lg:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium tracking-tight transition-colors group-hover:text-foreground">
                            {developer.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{developer.email}</p>
                          {meta ? <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p> : null}
                          {rosterPlans.length ? <RosterPlanUsage plans={rosterPlans} /> : null}
                        </div>

                        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                          {developer.manualPlans.length ? (
                            developer.manualPlans.map((plan) => (
                              <span
                                key={plan.id}
                                className="inline-flex max-w-full min-w-0 items-center gap-1.5 bg-brand-yellow-pale py-1 pr-2.5 pl-1 text-xs font-medium text-brand-yellow-dark lg:max-w-60"
                                title={`${toolLabel(plan.template.toolKey ?? plan.toolName)} ${plan.planName}`}
                              >
                                <ToolLogoTile
                                  tool={plan.template.toolKey ?? plan.toolName}
                                  size="sm"
                                  className="size-6 border-0 shadow-none"
                                />
                                <span className="min-w-0 truncate">
                                  {toolLabel(plan.template.toolKey ?? plan.toolName)} {plan.planName}
                                  {(plan.seatCount ?? 1) > 1 ? ` ×${plan.seatCount}` : ""}
                                </span>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No plan assigned</span>
                          )}
                          <span
                            aria-hidden
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "pointer-events-none rounded-none transition-colors group-hover:border-foreground/25 group-hover:bg-background",
                            )}
                          >
                            <BarChart3 className="transition-transform group-hover:scale-110" />
                            See Usage
                          </span>
                        </div>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <AddSubscriptionSheet
        open={addSubscriptionOpen}
        onOpenChange={setAddSubscriptionOpen}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

function detectedTools(developer: Developer) {
  return [
    ...new Set([
      ...developer.devices.flatMap((device) => device.toolInstallations.map((tool) => tool.toolName)),
      ...developer.toolEvidence.map((tool) => tool.toolName),
    ]),
  ].sort();
}
