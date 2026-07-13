"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddSubscriptionSheet } from "@/components/tools/add-subscription-sheet";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";

type Subscription = {
  id: string;
  toolKey: string | null;
  name: string;
  tier: string | null;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
  monthlySeatMicros: string;
  estimatedMonthlyMicros: string;
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
  monthlySeatMicros: string;
  vendorAccountEmail: string | null;
  template: { toolKey: string | null; catalogPlanKey: string | null };
};
type Developer = {
  id: string;
  name: string;
  email: string;
  role: string;
  requests7d: number;
  devices: Array<{ id: string; toolInstallations: Array<{ toolName: string }> }>;
  toolEvidence: Array<{ toolName: string }>;
  manualPlans: ManualPlan[];
};

const money = (micros: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number(BigInt(micros)) / 1_000_000,
  );
const utcToday = () => new Date().toISOString().slice(0, 10);

export function DeveloperToolInventory({ showSummary = true }: { showSummary?: boolean }) {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDeveloper, setOpenDeveloper] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addSubscriptionOpen, setAddSubscriptionOpen] = useState(false);

  const load = useCallback(async ({ soft = false }: { soft?: boolean } = {}) => {
    if (!soft) setLoading(true);
    const [developersRes, subscriptionsRes] = await Promise.all([
      fetch("/api/dashboard/developers"),
      fetch("/api/tools/subscriptions"),
    ]);
    const developersJson = await developersRes.json();
    const subscriptionsJson = await subscriptionsRes.json();
    if (!developersRes.ok || !subscriptionsRes.ok) {
      setError(developersJson.error ?? subscriptionsJson.error ?? "Could not load developers");
    } else {
      setDevelopers(developersJson.developers);
      setSubscriptions(subscriptionsJson.subscriptions);
      setError(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const configured = developers.filter((developer) => developer.manualPlans.length > 0).length;
  const unassignedActivity = developers.filter(
    (developer) => detectedTools(developer).length > 0 && developer.manualPlans.length === 0,
  ).length;
  const availableSeats = subscriptions.reduce((sum, subscription) => sum + subscription.availableSeats, 0);
  const canBulkAssign = developers.length > 1 && subscriptions.some((subscription) => subscription.availableSeats > 0);

  async function assign(developer: Developer, subscription: Subscription) {
    setSaving(`${developer.id}:${subscription.id}`);
    setError(null);
    const existing = developer.manualPlans.find((plan) => plan.planTemplateId === subscription.id);
    const response = existing
      ? await fetch(`/api/developers/${developer.id}/billing-assignments/${existing.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seatCount: Math.max(1, (existing.seatCount ?? 1) + 1) }),
        })
      : await fetch(`/api/developers/${developer.id}/billing-assignments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            planTemplateId: subscription.id,
            startDate: utcToday(),
            seatCount: 1,
            seatStatus: "active",
            vendorAccountEmail: developer.email,
          }),
        });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? (existing ? "Could not add another seat" : "Could not assign subscription"));
    } else {
      setAddingFor(null);
      setOpenDeveloper(developer.id);
      await load({ soft: true });
    }
    setSaving(null);
  }

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
      await load({ soft: true });
    }
    setSaving(null);
  }

  async function removeAssignment(developer: Developer, assignment: ManualPlan) {
    setSaving(assignment.id);
    setError(null);
    const seats = assignment.seatCount ?? 1;
    const response =
      seats > 1
        ? await fetch(`/api/developers/${developer.id}/billing-assignments/${assignment.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ seatCount: seats - 1 }),
          })
        : await fetch(`/api/developers/${developer.id}/billing-assignments/${assignment.id}`, {
            method: "DELETE",
          });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Could not remove plan");
    else await load({ soft: true });
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" /> Loading people…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showSummary && (
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            ["People covered", `${configured}/${developers.length}`],
            ["Seats available", availableSeats],
            ["Needs a plan", unassignedActivity],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-l-2 border-primary/40 pl-4">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Team members.</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {developers.length
                ? `${developers.length} on the roster · assign plans from above`
                : "Invite people, then assign plans here."}
            </p>
          </div>
        </div>

      {canBulkAssign && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-primary/5 px-4 py-3">
          <div className="mr-auto flex items-center gap-2 text-sm font-medium">
            <Users className="size-4" />
            {selected.size} selected
          </div>
          <div className="relative">
            <Button size="sm" onClick={() => setBulkOpen(!bulkOpen)}>
              Assign plan {bulkOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
            {bulkOpen && (
              <div className="absolute right-0 top-10 z-20 w-80 border bg-popover p-2 shadow-lg">
                <SubscriptionChoices
                  subscriptions={subscriptions.filter((subscription) => subscription.availableSeats > 0)}
                  requested={selected.size}
                  saving={saving}
                  onSelect={assignBulk}
                  onAddSubscription={() => setAddSubscriptionOpen(true)}
                />
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {!developers.length ? (
        <div className="bg-primary/5 px-5 py-10">
          <p className="text-sm text-muted-foreground">Invite people, then assign plans here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {developers.map((developer) => {
            const openSeats = subscriptions.filter((subscription) => subscription.availableSeats > 0);
            const expanded = openDeveloper === developer.id;
            const adding = addingFor === developer.id;

            return (
              <li key={developer.id}>
                <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    {canBulkAssign && (
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
                        className="mt-1 size-4 rounded border-input accent-primary"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold tracking-tight">{developer.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{developer.email}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {developer.manualPlans.length ? (
                      developer.manualPlans.map((plan) => (
                        <span
                          key={plan.id}
                          className="inline-flex items-center gap-1.5 bg-brand-yellow-pale py-1 pr-2.5 pl-1 text-xs font-medium text-brand-yellow-dark"
                        >
                          <ToolLogoTile
                            tool={plan.template.toolKey ?? plan.toolName}
                            size="sm"
                            className="size-6 border-0 shadow-none"
                          />
                          {toolLabel(plan.template.toolKey ?? plan.toolName)} {plan.planName}
                          {(plan.seatCount ?? 1) > 1 ? ` ×${plan.seatCount}` : ""}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No plan assigned</span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-expanded={expanded}
                      onClick={() => {
                        const next = expanded ? null : developer.id;
                        setOpenDeveloper(next);
                        setAddingFor(null);
                      }}
                    >
                      {developer.manualPlans.length ? "Manage" : "Assign"}
                      {expanded ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mb-4 border border-primary/20 bg-primary-pale p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary-dark">
                        Plans for {developer.name}
                      </p>
                      {!adding && (
                        <Button size="sm" className="shrink-0" onClick={() => setAddingFor(developer.id)}>
                          <Plus /> Add seat
                        </Button>
                      )}
                    </div>

                    {developer.manualPlans.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {developer.manualPlans.map((plan) => (
                          <div
                            key={plan.id}
                            className="flex flex-wrap items-center gap-3 bg-background px-3 py-3"
                          >
                            <ToolLogoTile tool={plan.template.toolKey ?? plan.toolName} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {toolLabel(plan.template.toolKey ?? plan.toolName)} {plan.planName}
                                {(plan.seatCount ?? 1) > 1 ? ` · ${plan.seatCount} seats` : ""}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {money(plan.monthlySeatMicros)}/mo · since{" "}
                                {new Date(plan.startDate).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={saving === plan.id}
                              onClick={() => removeAssignment(developer, plan)}
                            >
                              {saving === plan.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                              {(plan.seatCount ?? 1) > 1 ? "Remove seat" : "Remove"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">No plans on this person yet.</p>
                    )}

                    {adding ? (
                      <div className="mt-4 space-y-3 bg-primary-pale/80 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Add a seat or plan</p>
                          <Button variant="ghost" size="sm" onClick={() => setAddingFor(null)}>
                            Cancel
                          </Button>
                        </div>
                        <SubscriptionChoices
                          subscriptions={openSeats}
                          requested={1}
                          saving={saving}
                          existingPlanIds={new Set(developer.manualPlans.map((plan) => plan.planTemplateId))}
                          onSelect={(subscription) => assign(developer, subscription)}
                          onAddSubscription={() => setAddSubscriptionOpen(true)}
                        />
                      </div>
                    ) : openSeats.length === 0 ? (
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        <p className="text-xs text-muted-foreground">No seats left on company tools.</p>
                        <Button size="sm" variant="outline" onClick={() => setAddSubscriptionOpen(true)}>
                          <Plus /> Add subscription
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </section>

      <AddSubscriptionSheet
        open={addSubscriptionOpen}
        onOpenChange={setAddSubscriptionOpen}
        onCreated={async () => {
          await load({ soft: true });
          if (openDeveloper) setAddingFor(openDeveloper);
        }}
      />
    </div>
  );
}

function SubscriptionChoices({
  subscriptions,
  requested,
  saving,
  onSelect,
  existingPlanIds,
  onAddSubscription,
}: {
  subscriptions: Subscription[];
  requested: number;
  saving: string | null;
  onSelect: (subscription: Subscription) => void;
  existingPlanIds?: Set<string>;
  onAddSubscription?: () => void;
}) {
  if (!subscriptions.length) {
    return (
      <div className="rounded-md bg-background/70 px-4 py-5 text-sm text-muted-foreground">
        <p>No seats are available yet.</p>
        {onAddSubscription && (
          <Button size="sm" className="mt-3" onClick={onAddSubscription}>
            <Plus /> Add subscription
          </Button>
        )}
      </div>
    );
  }
  const hasExhausted = subscriptions.some((subscription) => subscription.availableSeats < requested);
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {subscriptions.map((subscription) => {
          const exhausted = subscription.availableSeats < requested;
          const alreadyAssigned = existingPlanIds?.has(subscription.id);
          return (
            <button
              key={subscription.id}
              type="button"
              disabled={exhausted || Boolean(saving)}
              onClick={() => onSelect(subscription)}
              className="flex items-center gap-3 rounded-md bg-background px-3 py-3 text-left outline-none transition hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ToolLogoTile tool={subscription.toolKey ?? ""} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {alreadyAssigned ? "Add another " : ""}
                  {toolLabel(subscription.toolKey)} {subscription.name}
                </p>
                <p className={cn("text-xs", exhausted ? "text-destructive" : "text-muted-foreground")}>
                  {exhausted
                    ? "No seats available"
                    : `${subscription.availableSeats} ${subscription.availableSeats === 1 ? "seat" : "seats"} open`}
                </p>
              </div>
              {saving?.endsWith(subscription.id) && <Loader2 className="size-4 animate-spin" />}
            </button>
          );
        })}
      </div>
      {onAddSubscription && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start border-dashed bg-muted/50 hover:bg-muted/70"
          onClick={onAddSubscription}
        >
          <Plus /> Add a subscription not listed
        </Button>
      )}
      {hasExhausted && !onAddSubscription && (
        <p className="mt-2 text-xs text-muted-foreground">A plan is full. Add more seats first.</p>
      )}
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

function toolLabel(tool: string | null) {
  const key = canonicalToolKey(tool ?? "");
  return key === "chatgpt-codex"
    ? "ChatGPT"
    : key === "github-copilot"
      ? "Copilot"
      : key
        ? key.charAt(0).toUpperCase() + key.slice(1)
        : "Tool";
}
