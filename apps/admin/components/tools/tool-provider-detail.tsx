"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { SignalsKpi } from "@/components/signals/signals-ui";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { MobileDataCard, MobileDataField, MobileDataList } from "@/components/ui/mobile-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddSubscriptionSheet } from "./add-subscription-sheet";
import { ToolLogoTile } from "./tool-brand-icon";
import type { ToolDetailData } from "@/lib/queries/dashboard/tool-detail";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { formatMicrosAsCurrency, formatUsd } from "@/lib/format";
import { useInvalidateAppData } from "@/lib/api/client";
import {
  isSecondaryQuotaWindow,
  quotaRemainingLabel,
  quotaResetLabel,
  quotaWindowLabel,
} from "@/lib/quotas/display";

type PlanRow = ToolDetailData["plans"][number] & {
  cycleSeatMicros: string | bigint;
  estimatedCycleMicros: string | bigint;
};

type DetailProps = Omit<ToolDetailData, "plans"> & {
  plans: PlanRow[];
};

function quotaStatus(percent: number | null) {
  if (percent == null) {
    return {
      label: "Reported",
      badge: "border-border bg-muted text-muted-foreground",
      bar: "bg-primary",
    };
  }
  if (percent >= 90) {
    return {
      label: "Near limit",
      badge: "border-destructive/30 bg-destructive/10 text-destructive",
      bar: "bg-destructive",
    };
  }
  if (percent >= 75) {
    return {
      label: "Watch",
      badge: "border-warning/30 bg-warning/10 text-[#9a5f0d]",
      bar: "bg-warning",
    };
  }
  return {
    label: "Available",
    badge: "border-success/30 bg-success/10 text-success",
    bar: "bg-success",
  };
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
  const invalidateAppData = useInvalidateAppData();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const basePath = periodBasePath ?? `/tools/${data.toolKey}`;

  async function refresh() {
    await invalidateAppData();
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
  const peopleReporting = quotaGroups.filter((group) => group.windows.length > 0).length;

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
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/tools">Tools</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

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
      <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Devices"
          hero
          className="pl-5"
          value={data.kpis.devices}
          sub="With this tool installed"
        />
        <SignalsKpi
          label="People"
          className="sm:border-l sm:border-border sm:pl-8"
          value={data.kpis.people}
          sub="Detected or assigned"
        />
        <SignalsKpi
          label="Seats free"
          className="xl:border-l xl:border-border xl:pl-8"
          value={data.kpis.seatsFree}
          sub={`${data.kpis.seatsAssigned}/${data.kpis.seatsPurchased} assigned`}
        />
        <SignalsKpi
          label={`Usage cost (${periodSuffix})`}
          accent
          className="sm:pl-8"
          value={formatUsd(data.kpis.usageCost)}
          sub={`${data.kpis.requests.toLocaleString()} requests · verified + estimated · ${periodLabel}`}
        />
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-8 rounded-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="mt-12">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Live quotas.</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Current allowance pressure reported by connected machines.
            </p>
          </div>
          {quotaGroups.length ? (
            <Badge variant="outline" className="w-fit bg-card text-muted-foreground">
              {peopleReporting} {peopleReporting === 1 ? "person" : "people"} reporting
            </Badge>
          ) : null}
        </div>
        {quotaGroups.length ? (
          <div className="divide-y border bg-card">
            {quotaGroups.map((group) => {
              const person = group.developerId ? peopleByDeveloperId.get(group.developerId) ?? null : null;
              return (
                <div
                  key={group.key}
                  className="grid gap-5 p-4 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,2fr)] lg:p-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{group.developerName}</p>
                    {group.deviceHostname ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{group.deviceHostname}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {person?.assignment ? (
                        <>
                          <Badge className="border-brand-yellow-dark/20 bg-brand-yellow-pale px-2.5 py-1 text-brand-yellow-dark">
                            {person.assignment.planName}
                          </Badge>
                          <Badge variant="outline" className="bg-background text-muted-foreground">
                            {person.assignment.source === "detected" ? "Detected plan" : "Assigned plan"}
                          </Badge>
                        </>
                      ) : person?.vendorPlan ? (
                        <>
                          <Badge className="border-brand-yellow-dark/20 bg-brand-yellow-pale px-2.5 py-1 text-brand-yellow-dark">
                            {person.vendorPlan}
                          </Badge>
                          <Badge variant="outline" className="bg-background text-muted-foreground">
                            Reported plan
                          </Badge>
                        </>
                      ) : person?.detected ? (
                        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-[#9a5f0d]">
                          Plan unknown
                        </Badge>
                      ) : null}
                    </div>
                    {person?.planMismatch && person?.mappedCatalogPlanKey ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs leading-5 text-muted-foreground">
                          Reported plan maps to {person.mappedCatalogPlanKey}; the company assignment is{" "}
                          {person.assignment?.catalogPlanKey ?? "different"}.
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
                  {group.windows.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                        const resetCopy =
                          reset && isSecondaryQuotaWindow(quota.windowType)
                            ? reset.replace(/^resets /, "expires ")
                            : reset;
                        const status = quotaStatus(percent);
                        return (
                          <div
                            key={`${quota.windowType}-${quota.deviceHostname ?? "org"}`}
                            className="border bg-background p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {quotaWindowLabel(quota.windowType)}
                                </p>
                                <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
                                  {percent != null ? `${percent.toFixed(0)}%` : (remaining ?? "—")}
                                </p>
                                {percent != null ? (
                                  <p className="text-[0.65rem] text-muted-foreground">used</p>
                                ) : null}
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[0.65rem] uppercase tracking-[0.06em] ${status.badge}`}
                              >
                                {status.label}
                              </Badge>
                            </div>
                            {percent != null ? (
                              <div
                                className="relative mt-3 h-1.5 w-full overflow-hidden bg-muted"
                                role="meter"
                                aria-label={`${quotaWindowLabel(quota.windowType)} usage`}
                                aria-valuenow={Math.round(percent)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <span
                                  className={`absolute inset-y-0 left-0 ${status.bar}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            ) : null}
                            {resetCopy ? (
                              <p className="mt-2 text-[0.65rem] text-muted-foreground">{resetCopy}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty className="min-h-24 gap-1 border bg-background p-4 md:p-4">
                      <EmptyDescription className="text-xs">No quota windows reported yet.</EmptyDescription>
                    </Empty>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
            <EmptyDescription>No quota windows yet — they appear after the agent reports.</EmptyDescription>
          </Empty>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Models.</h2>
            <p className="mt-1 text-xs text-muted-foreground">Model usage by person · {periodLabel}</p>
          </div>
          {data.modelsByDeveloper.length ? (
            <p className="text-xs text-muted-foreground">
              {data.modelsByDeveloper.length} row{data.modelsByDeveloper.length === 1 ? "" : "s"} ·{" "}
              {modelTotals.requests.toLocaleString()} requests · {formatUsd(modelTotals.cost)}
            </p>
          ) : null}
        </div>
        {data.modelsByDeveloper.length ? (
          <>
            <MobileDataList>
              {data.modelsByDeveloper.map((m) => (
                <MobileDataCard key={`${m.developerId}-${m.model}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.model}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{m.developerName}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    <MobileDataField label="Requests" value={m.requests.toLocaleString()} />
                    <MobileDataField label="Tokens" value={m.tokens.toLocaleString()} />
                    <MobileDataField label="Cost" value={formatUsd(m.cost)} />
                  </dl>
                </MobileDataCard>
              ))}
            </MobileDataList>
            <div className="hidden max-h-[28rem] overflow-auto border md:block">
            <Table className="w-full text-sm">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="border-b hover:bg-transparent">
                  <TableHead className="h-9 px-3 font-medium">Person</TableHead>
                  <TableHead className="h-9 px-3 font-medium">Model</TableHead>
                  <TableHead className="h-9 px-3 text-right font-medium">Requests</TableHead>
                  <TableHead className="h-9 px-3 text-right font-medium">Tokens</TableHead>
                  <TableHead className="h-9 px-3 text-right font-medium">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.modelsByDeveloper.map((m) => (
                  <TableRow
                    key={`${m.developerId}-${m.model}`}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="px-3 py-2 text-muted-foreground">{m.developerName}</TableCell>
                    <TableCell className="px-3 py-2 font-medium">{m.model}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {m.requests.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {m.tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{formatUsd(m.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        ) : (
          <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
            <EmptyDescription>No model usage reported for this period yet.</EmptyDescription>
          </Empty>
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
                      {formatMicrosAsCurrency(plan.cycleSeatMicros)} per seat / cycle ·{" "}
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
          <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
            <EmptyDescription>
              No company plans for this tool yet. Add one, or connect a machine to auto-sync.
            </EmptyDescription>
          </Empty>
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
