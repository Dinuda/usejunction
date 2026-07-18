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
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ToolLogoTile } from "./tool-brand-icon";
import type { ToolDetailData } from "@/lib/queries/dashboard/tool-detail";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { quotaRemainingLabel, quotaResetLabel, quotaWindowLabel } from "@/lib/quotas/display";

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

export function ToolProviderDetail({
  data,
  cycleView = "current_cycles",
  period = DEFAULT_ROLLING_PERIOD,
  periodLabel = "current billing cycles",
  periodSuffix = "current",
  periodBasePath,
}: {
  data: DetailProps;
  cycleView?: CycleView;
  period?: RollingPeriod;
  periodLabel?: string;
  periodSuffix?: string;
  periodBasePath?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const basePath = periodBasePath ?? `/tools/${data.toolKey}`;

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

  const peopleByDeveloperId = new Map<string, (typeof data.people)[number]>();
  for (const person of data.people) peopleByDeveloperId.set(person.developerId, person);

  // One row per person: combine all their quota windows, and fold in plan assignment.
  type QuotaGroup = {
    key: string;
    developerId: string | null;
    developerName: string;
    deviceHostname: string | null;
    windows: typeof data.quotas;
  };
  const quotaGroupMap = new Map<string, QuotaGroup>();
  for (const quota of data.quotas) {
    const key = quota.developerId ?? quota.developerName ?? `device:${quota.deviceHostname ?? "org"}`;
    const existing = quotaGroupMap.get(key);
    if (existing) {
      existing.windows.push(quota);
    } else {
      quotaGroupMap.set(key, {
        key,
        developerId: quota.developerId,
        developerName: quota.developerName ?? "Unassigned device",
        deviceHostname: quota.deviceHostname,
        windows: [quota],
      });
    }
  }
  // People with an assignment but no quota windows still appear so the assignment is visible.
  for (const person of data.people) {
    if (quotaGroupMap.has(person.developerId)) continue;
    if (!person.assignment) continue;
    quotaGroupMap.set(person.developerId, {
      key: person.developerId,
      developerId: person.developerId,
      developerName: person.name,
      deviceHostname: person.deviceHostname,
      windows: [],
    });
  }
  const quotaGroups = Array.from(quotaGroupMap.values()).sort((a, b) =>
    a.developerName.localeCompare(b.developerName),
  );

  const modelTotals = data.modelsByDeveloper.reduce(
    (acc, row) => {
      acc.requests += row.requests;
      acc.tokens += row.tokens;
      acc.cost += row.cost;
      return acc;
    },
    { requests: 0, tokens: 0, cost: 0 },
  );

  return (
    <>
      <Link
        href="/tools"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-3.5" />
        Tools
      </Link>

      <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <ToolLogoTile tool={data.toolKey} size="lg" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{data.name}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Plans your team runs, who uses them, and live quota pressure.
            </p>
          </div>
        </div>
        <CycleViewPicker view={cycleView} period={period} basePath={basePath} />
      </div>

      <div className="grid items-start gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex h-full flex-col justify-start border-l-2 border-border-strong py-3 pl-4 pr-3">
          <p className="text-xs font-medium leading-4 uppercase tracking-[0.08em] text-muted-foreground">Devices</p>
          <p className="mt-2 flex min-h-10 items-end text-3xl font-semibold leading-none tracking-tight tabular-nums">{data.kpis.devices}</p>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">With this tool installed</p>
        </div>
        <div className="flex h-full flex-col justify-start border-l-2 border-border-strong py-3 pl-4 pr-3">
          <p className="text-xs font-medium leading-4 uppercase tracking-[0.08em] text-muted-foreground">People</p>
          <p className="mt-2 flex min-h-10 items-end text-3xl font-semibold leading-none tracking-tight tabular-nums">{data.kpis.people}</p>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">Detected or assigned</p>
        </div>
        <div className="flex h-full flex-col justify-start border-l-2 border-border-strong py-3 pl-4 pr-3">
          <p className="text-xs font-medium leading-4 uppercase tracking-[0.08em] text-muted-foreground">Seats free</p>
          <p className="mt-2 flex min-h-10 items-end text-3xl font-semibold leading-none tracking-tight tabular-nums">{data.kpis.seatsFree}</p>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            {data.kpis.seatsAssigned}/{data.kpis.seatsPurchased} assigned
          </p>
        </div>
        <div className="flex h-full flex-col justify-start border-l-2 border-brand-yellow-dark bg-brand-yellow-pale py-3 pl-4 pr-4">
          <p className="text-xs font-medium leading-4 uppercase tracking-[0.08em] text-muted-foreground">
            Usage cost ({periodSuffix})
          </p>
          <p className="mt-2 flex min-h-10 items-end text-3xl font-semibold leading-none tracking-tight tabular-nums">
            {currency(data.kpis.usageCost)}
          </p>
          <p className="mt-2 text-xs leading-4 text-muted-foreground">
            {data.kpis.requests.toLocaleString()} requests · verified + estimated · {periodLabel}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-8 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {(data.toolsUsed?.length > 0 || data.toolSequences?.length > 0) &&
      (data.toolKey === "chatgpt-codex" || data.toolKey === "codex-work" || data.toolName === "codex" || data.toolName === "codex-work") ? (
        <section className="mt-12">
          <div className="mb-6">
            <h2 className="text-lg font-semibold tracking-tight">Tools used.</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Agent tool names from local sessions — counts only, no prompts or arguments.
            </p>
          </div>
          {data.toolsUsed.length ? (
            <div className="mb-8">
              {data.toolsUsed.map((tool) => (
                <div
                  key={tool.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 text-sm"
                >
                  <p className="truncate font-medium tabular-nums">{tool.name}</p>
                  <p className="tabular-nums text-muted-foreground">{tool.calls.toLocaleString()} calls</p>
                </div>
              ))}
            </div>
          ) : null}
          {data.toolSequences.length ? (
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Common tool sequences
              </p>
              {data.toolSequences.map((seq) => (
                <div
                  key={seq.digest}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3 text-sm"
                >
                  <p className="break-all font-medium leading-snug">{seq.digest.replaceAll(">", " → ")}</p>
                  <p className="tabular-nums text-muted-foreground">{seq.sessions.toLocaleString()} sessions</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-12">
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Live quotas.</h2>
          <p className="mt-1 text-xs text-muted-foreground">Windows reported from connected machines</p>
        </div>
        {quotaGroups.length ? (
          <div>
            {quotaGroups.map((group) => {
              const person = group.developerId ? peopleByDeveloperId.get(group.developerId) ?? null : null;
              return (
                <div key={group.key} className="py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{group.developerName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {group.deviceHostname ?? ""}
                        {person?.vendorPlan ? ` · vendor ${person.vendorPlan}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {person?.assignment ? (
                        <span className="bg-brand-yellow-pale px-2 py-1 text-xs font-medium text-brand-yellow-dark">
                          Assigned · {person.assignment.planName}
                          {person.assignment.source === "detected" ? " (detected)" : ""}
                        </span>
                      ) : person?.detected ? (
                        <span className="border px-2 py-1 text-xs text-muted-foreground">Detected · plan unknown</span>
                      ) : null}
                      {person?.planMismatch && person?.mappedCatalogPlanKey ? (
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
                  {group.windows.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {group.windows.map((quota) => {
                        const hasPercent =
                          quota.usedPercent != null && !Number.isNaN(quota.usedPercent);
                        const percent = hasPercent
                          ? Math.min(100, Math.max(0, quota.usedPercent as number))
                          : null;
                        const remaining = quotaRemainingLabel(
                          quota.creditsRemaining,
                          quota.windowType,
                        );
                        const reset = quotaResetLabel(quota.resetAt);
                        return (
                          <div
                            key={`${quota.windowType}-${quota.deviceHostname ?? "org"}`}
                            className="border px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-muted-foreground">
                                {quotaWindowLabel(quota.windowType)}
                              </span>
                              <span className="tabular-nums font-semibold">
                                {percent != null ? `${percent.toFixed(0)}%` : (remaining ?? "—")}
                              </span>
                            </div>
                            {percent != null ? (
                              <div
                                className="relative mt-1.5 h-1.5 w-full bg-muted"
                                role="meter"
                                aria-label={`${quotaWindowLabel(quota.windowType)} usage`}
                                aria-valuenow={Math.round(percent)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <span
                                  className="absolute inset-y-0 left-0 bg-foreground"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            ) : null}
                            {reset ? (
                              <p className="mt-1.5 text-[0.65rem] text-muted-foreground">{reset}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">No quota windows reported yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No quota windows yet — they appear after the agent reports.
          </p>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Models.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Model usage by person · {periodLabel}</p>
          </div>
          {data.modelsByDeveloper.length ? (
            <p className="text-xs text-muted-foreground">
              {data.modelsByDeveloper.length} row{data.modelsByDeveloper.length === 1 ? "" : "s"} ·{" "}
              {modelTotals.requests.toLocaleString()} requests · {currency(modelTotals.cost)}
            </p>
          ) : null}
        </div>
        {data.modelsByDeveloper.length ? (
          <div className="max-h-[28rem] overflow-auto border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b">
                  <th className="h-9 px-3 text-left align-middle font-medium text-muted-foreground">Person</th>
                  <th className="h-9 px-3 text-left align-middle font-medium text-muted-foreground">Model</th>
                  <th className="h-9 px-3 text-right align-middle font-medium text-muted-foreground">Requests</th>
                  <th className="h-9 px-3 text-right align-middle font-medium text-muted-foreground">Tokens</th>
                  <th className="h-9 px-3 text-right align-middle font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.modelsByDeveloper.map((m) => (
                  <tr key={`${m.developerId}-${m.model}`} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 align-middle text-muted-foreground">{m.developerName}</td>
                    <td className="px-3 py-2 align-middle font-medium">{m.model}</td>
                    <td className="px-3 py-2 text-right align-middle tabular-nums">{m.requests.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right align-middle tabular-nums">{m.tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right align-middle tabular-nums">{currency(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No model usage reported for this period yet.
          </p>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Plans.</h2>
            <p className="mt-1 text-xs text-muted-foreground">What&apos;s bought and ready to assign.</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Add plan
          </Button>
        </div>

        {data.plans.length ? (
          <div>
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
