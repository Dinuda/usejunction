"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronDown, ChevronUp, SquarePen, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { SignalsKpi } from "@/components/signals/signals-ui";
import { cn } from "@/lib/utils";
import { AddSubscriptionSheet } from "@/components/tools/add-subscription-sheet";
import { Panel } from "@/components/panel";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { RosterPlanUsage, type RosterPlanUsagePlan } from "@/components/developers/roster-plan-usage";
import { SubscriptionChoices } from "@/components/developers/member-plans-panel";
import { formatCompactNumber } from "@/lib/format";
import type { PlanUsageDeveloperRow } from "@/lib/insights/contracts/plan-usage.v1";
import { toolDisplayName } from "@/lib/tools/catalog";

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
  authUserId: string | null;
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
        <div className="grid items-start gap-y-8 sm:grid-cols-3">
          <SignalsKpi
            label="People covered"
            hero
            className="pl-5"
            value={`${configured}/${developers.length}`}
          />
          <SignalsKpi
            label="Seats available"
            className="sm:border-l sm:border-border sm:pl-8"
            value={availableSeats}
          />
          <SignalsKpi
            label="Needs a plan"
            className="sm:border-l sm:border-border sm:pl-8"
            value={unassignedActivity}
          />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Panel as="section" padded={false}>
        <div className="border-b bg-muted/25 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Team members.</h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {developers.length
              ? `${developers.length} on the roster · open anyone for plans, their device, and usage`
              : "Invite people, then assign plans from their profile."}
          </p>
        </div>

        <div>
          {canBulkAssign && selected.size > 0 ? (
            <div className="mx-5 mt-4 mb-1 flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3">
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
            <Empty className="min-h-0 gap-1 border-0 px-5 py-6 md:px-5 md:py-6">
              <EmptyDescription>Invite people, then open their profile to assign plans.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="divide-y">
              {developers.map((developer) => {
                const machineCount = developer.devices.length;
                const meta = [
                  machineCount
                    ? `${machineCount} ${machineCount === 1 ? "machine" : "machines"}`
                    : "No machines",
                  developer.requests > 0 ? `${formatCompactNumber(developer.requests)} requests · ${periodSuffix}` : null,
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
                  <li
                    key={developer.id}
                    className="group transition-colors hover:bg-muted/40 has-[:focus-visible]:bg-muted/40"
                  >
                    <div className="flex items-start gap-3 px-5 py-5">
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
                          className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                        />
                      ) : null}
                      <Link
                        href={`/team/${developer.id}`}
                        className="grid min-w-0 flex-1 gap-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-offset-2 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-start"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium tracking-tight transition-colors group-hover:text-foreground">
                            {developer.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{developer.email}</p>
                          {meta ? <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p> : null}
                          {rosterPlans.length ? <RosterPlanUsage plans={rosterPlans} /> : null}
                          {developer.manualPlans.length ? (
                            <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                              {developer.manualPlans.map((plan) => (
                                <span
                                  key={plan.id}
                                  className="inline-flex max-w-full min-w-0 items-center gap-1.5 bg-brand-yellow-pale py-1 pr-2.5 pl-1 text-xs font-medium text-brand-yellow-dark"
                                  title={`${toolDisplayName(plan.template.toolKey ?? plan.toolName)} ${plan.planName}`}
                                >
                                  <ToolLogoTile
                                    tool={plan.template.toolKey ?? plan.toolName}
                                    size="sm"
                                    className="size-6 border-0 shadow-none"
                                  />
                                  <span className="min-w-0 truncate">
                                    {toolDisplayName(plan.template.toolKey ?? plan.toolName)} {plan.planName}
                                    {(plan.seatCount ?? 1) > 1 ? ` ×${plan.seatCount}` : ""}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <span
                          aria-hidden
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "pointer-events-none shrink-0 self-start rounded-none transition-colors group-hover:border-foreground/25 group-hover:bg-background",
                          )}
                        >
                          <BarChart3 className="transition-transform group-hover:scale-110" />
                          See Usage
                        </span>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 self-start rounded-none px-2.5"
                        asChild
                      >
                        <Link href={`/team/${developer.id}`} aria-label={`Edit ${developer.name}`}>
                          <SquarePen className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>

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
