"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { AddSubscriptionSheet } from "@/components/tools/add-subscription-sheet";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { formatMicrosAsCurrency } from "@/lib/format";
import { toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";

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
  billingCadence: string;
  cycleSeatMicros: string;
  vendorAccountEmail: string | null;
  template: { toolKey: string | null; catalogPlanKey: string | null };
};

type Developer = {
  id: string;
  name: string;
  email: string;
  manualPlans: ManualPlan[];
};

const utcToday = () => new Date().toISOString().slice(0, 10);

export function MemberPlansPanel({
  developerId: _developerId,
  developerName,
  initialDeveloper,
  initialSubscriptions,
}: {
  developerId: string;
  developerName: string;
  initialDeveloper: Developer;
  initialSubscriptions: Subscription[];
}) {
  const router = useRouter();
  const [developer, setDeveloper] = useState<Developer | null>(initialDeveloper);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addSubscriptionOpen, setAddSubscriptionOpen] = useState(false);

  useEffect(() => {
    setDeveloper(initialDeveloper);
    setSubscriptions(initialSubscriptions);
  }, [initialDeveloper, initialSubscriptions]);

  async function assign(subscription: Subscription) {
    if (!developer) return;
    setSaving(subscription.id);
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
      setAdding(false);
      router.refresh();
    }
    setSaving(null);
  }

  async function removeAssignment(assignment: ManualPlan) {
    if (!developer) return;
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
    else router.refresh();
    setSaving(null);
  }

  const openSeats = subscriptions.filter((subscription) => subscription.availableSeats > 0);
  const plans = developer?.manualPlans ?? [];

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Plans.</h2>
          <p className="mt-1 text-xs text-muted-foreground">Seats assigned to {developerName}.</p>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add seat
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4 rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {plans.length ? (
        <ul>
          {plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center gap-3 py-5">
              <ToolLogoTile tool={plan.template.toolKey ?? plan.toolName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {toolDisplayName(plan.template.toolKey ?? plan.toolName)} {plan.planName}
                  {(plan.seatCount ?? 1) > 1 ? ` · ${plan.seatCount} seats` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatMicrosAsCurrency(plan.cycleSeatMicros)}/cycle · {plan.billingCadence} · since {new Date(plan.startDate).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={saving === plan.id}
                onClick={() => removeAssignment(plan)}
              >
                {saving === plan.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {(plan.seatCount ?? 1) > 1 ? "Remove seat" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
          <EmptyDescription>No plans on this person yet.</EmptyDescription>
        </Empty>
      )}

      {adding ? (
        <div className="mt-4 space-y-3 border border-primary/20 bg-primary-pale p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-primary-dark">
              Add a seat or plan
            </p>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          <SubscriptionChoices
            subscriptions={openSeats}
            requested={1}
            saving={saving}
            existingPlanIds={new Set(plans.map((plan) => plan.planTemplateId))}
            onSelect={assign}
            onAddSubscription={() => setAddSubscriptionOpen(true)}
          />
        </div>
      ) : null}

      <AddSubscriptionSheet
        open={addSubscriptionOpen}
        onOpenChange={setAddSubscriptionOpen}
        onCreated={() => {
          router.refresh();
          setAdding(true);
        }}
      />
    </section>
  );
}

export function SubscriptionChoices({
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
      <Empty className="min-h-0 gap-2 border-0 rounded-md bg-background/70 p-6 md:p-6">
        <EmptyDescription>No seats are available yet.</EmptyDescription>
        {onAddSubscription && (
          <Button size="sm" className="mt-3" onClick={onAddSubscription}>
            <Plus /> Add subscription
          </Button>
        )}
      </Empty>
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
                  {toolDisplayName(subscription.toolKey ?? "")} {subscription.name}
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
