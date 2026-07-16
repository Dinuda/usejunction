"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ToolLogoTile } from "./tool-brand-icon";
import type { ToolDetailData } from "@/lib/queries/dashboard/tool-detail";
import { quotaResetLabel, quotaWindowLabel } from "@/lib/quotas/display";
import { cn } from "@/lib/utils";

type PlanRow = ToolDetailData["plans"][number] & {
  cycleSeatMicros: string | bigint;
  estimatedCycleMicros: string | bigint;
};

type DetailProps = Omit<ToolDetailData, "plans"> & {
  plans: PlanRow[];
};

const money = (micros: string | bigint, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(BigInt(micros)) / 1_000_000);

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

export function ToolProviderDetail({ data }: { data: DetailProps }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function refresh() {
    router.refresh();
  }

  async function updateSeats(plan: PlanRow, nextCapacity: number) {
    if (nextCapacity < plan.assignedSeats) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/tools/subscriptions/${plan.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatCapacity: nextCapacity }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Could not update seats");
    else await refresh();
    setSaving(false);
  }

  async function removePlan() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/tools/subscriptions/${deleteTarget.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not remove plan");
      setSaving(false);
      return;
    }
    setDeleteTarget(null);
    await refresh();
    setSaving(false);
  }

  async function applyDetected(developerId: string) {
    setApplyingId(developerId);
    setError(null);
    const response = await fetch(`/api/tools/${data.toolKey}/apply-detected`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ developerId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? "Could not apply detected plan");
    else await refresh();
    setApplyingId(null);
  }

  const detectedCount = data.people.filter((person) => person.detected).length;
  const assignedCount = data.people.filter((person) => person.assignment).length;

  return (
    <>
      <Link
        href="/tools"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Tools
      </Link>

      <div className="mb-10 flex items-start gap-4">
        <ToolLogoTile tool={data.toolKey} size="lg" />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{data.name}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Plans your team runs, who uses them, and live quota pressure.
          </p>
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Devices", value: data.kpis.devices, sub: "With this tool installed" },
          { label: "People", value: data.kpis.people, sub: "Detected or assigned" },
          { label: "Seats free", value: data.kpis.seatsFree, sub: `${data.kpis.seatsAssigned}/${data.kpis.seatsPurchased} assigned` },
          { label: "Spend (7d)", value: currency(data.kpis.spend7d), sub: `${data.kpis.requests7d.toLocaleString()} requests`, accent: true },
        ].map((item) => (
          <div
            key={item.label}
            className={cn(
              "pl-4",
              item.accent
                ? "border-l-2 border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4"
                : "border-l-2 border-border-strong",
            )}
          >
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{item.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.sub}</p>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-8 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="mt-12">
        <div className="mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">People on this tool.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {detectedCount} detected · {assignedCount} assigned
          </p>
        </div>
        {data.people.length ? (
          <div className="divide-y">
            {data.people.map((person) => (
              <div key={person.developerId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {person.email}
                    {person.deviceHostname ? ` · ${person.deviceHostname}` : ""}
                    {person.vendorPlan ? ` · vendor ${person.vendorPlan}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {person.assignment ? (
                    <span className="bg-brand-yellow-pale px-2 py-1 text-xs font-medium text-brand-yellow-dark">
                      Assigned · {person.assignment.planName}
                      {person.assignment.source === "detected" ? " (detected)" : ""}
                    </span>
                  ) : person.detected ? (
                    <span className="border px-2 py-1 text-xs text-muted-foreground">Detected · plan unknown</span>
                  ) : null}
                  {person.planMismatch && person.mappedCatalogPlanKey ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Vendor maps to {person.mappedCatalogPlanKey}, company still has{" "}
                        {person.assignment?.catalogPlanKey ?? "another plan"}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={applyingId === person.developerId}
                        onClick={() => void applyDetected(person.developerId)}
                      >
                        {applyingId === person.developerId ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Use detected plan"
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No one is using this tool yet. It appears here after a teammate connects a machine.
          </p>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Live quotas.</h2>
          <p className="mt-1 text-xs text-muted-foreground">Windows reported from connected machines</p>
        </div>
        {data.quotas.length ? (
          <div className="divide-y border-y">
            {data.quotas.map((quota) => (
              <div
                key={`${quota.toolName}-${quota.windowType}-${quota.deviceHostname ?? "org"}`}
                className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_minmax(12rem,auto)] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{quota.developerName ?? "Unassigned device"}</p>
                  {quota.deviceHostname ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{quota.deviceHostname}</p>
                  ) : null}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {quotaWindowLabel(quota.windowType)}
                </p>
                <p className="tabular-nums sm:text-right">
                  <span className="font-semibold">
                    {quota.usedPercent != null ? `${quota.usedPercent.toFixed(0)}% used` : "Usage unavailable"}
                  </span>
                  {quotaResetLabel(quota.resetAt) ? (
                    <span className="ml-2 text-xs text-muted-foreground">· {quotaResetLabel(quota.resetAt)}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No quota windows yet — they appear after the agent reports.
          </p>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between gap-4 border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Plans.</h2>
            <p className="mt-1 text-xs text-muted-foreground">What&apos;s bought and ready to assign.</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add plan
          </Button>
        </div>

        {data.plans.length ? (
          <div className="divide-y">
            {data.plans.map((plan) => (
              <div key={plan.id} className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{plan.name}</p>
                      {plan.priceSource === "detected" && <Badge variant="outline">Detected</Badge>}
                      {plan.customPrice && <Badge variant="outline">Custom price</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {money(plan.cycleSeatMicros)} per seat / cycle ·{" "}
                      <span className="capitalize">{plan.billingCadence}</span> billing
                    </p>
                    {plan.priceSource === "detected" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Auto-synced from device usage. Update when the vendor plan differs.
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${plan.name}`}
                    disabled={saving}
                    onClick={() => setDeleteTarget(plan)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {plan.assignedSeats} assigned · {plan.availableSeats} available
                    </p>
                    <p className="text-xs text-muted-foreground">{plan.seatCapacity} purchased seats</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Remove a seat"
                      disabled={saving || plan.seatCapacity <= Math.max(1, plan.assignedSeats)}
                      onClick={() => void updateSeats(plan, plan.seatCapacity - 1)}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{plan.seatCapacity}</span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Add a seat"
                      disabled={saving}
                      onClick={() => void updateSeats(plan, plan.seatCapacity + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No company plans for this tool yet. Add one, or connect a machine to auto-sync.
          </p>
        )}
      </section>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md gap-5">
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              {(deleteTarget?.assignedSeats ?? 0) > 0
                ? `This removes the plan and unassigns ${deleteTarget?.assignedSeats} developer ${(deleteTarget?.assignedSeats ?? 0) === 1 ? "seat" : "seats"}.`
                : "This removes the plan from your company tools."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removePlan()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddSubscriptionSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        initialToolKey={data.toolKey}
        onCreated={refresh}
      />
    </>
  );
}
