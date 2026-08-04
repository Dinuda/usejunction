import type { PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import type { BillingCycleInfo, PlanUsageSubscriptionRow, UsageWindowMetadata } from "@/lib/insights/contracts/plan-usage.v1";
import { projectQuotaPace } from "@/lib/quotas/pace";
import { quotaWindowLabel } from "@/lib/quotas/display";
import { usageWindowPreferenceLabel } from "@/lib/quotas/usage-window";

export type SubscriptionCycleSliceRow = {
  id: string;
  subscriptionId: string;
  name: string;
  toolName: string;
  toolKey: string | null;
  cycleSpend: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  modelCalls: number;
  windowFrom: string;
  windowTo: string;
  billingCycle: BillingCycleInfo;
  /** Seat billing cadence for this slice (monthly / weekly / …). */
  billingCadence?: string | null;
};

export type ToolSubscriptionCycleRow = {
  id: string;
  toolName: string;
  toolKey: string | null;
  planNames: string[];
  planCount: number;
  cycleSpend: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  modelCalls: number;
  windowFrom: string;
  windowTo: string;
  spendSharePercent: number;
  utilizationPercent: number | null;
  utilizationDisplayPercent: number | null;
  verdictCode: PlanVerdictCode | null;
  /** Earliest projected allowance exhaustion among near-limit plans. */
  expectedEndAt: string | null;
  /** Primary seat billing cycle (longest among plans under this tool). */
  billingCycle: BillingCycleInfo;
  /** Seat billing cadence for the primary cycle (monthly / weekly / …). */
  billingCadence: string | null;
  usageWindow: UsageWindowMetadata | null;
  projectionState: "forming" | "reliable" | "unavailable";
};

const VERDICT_RANK: Record<PlanVerdictCode, number> = {
  LIMIT_EXCEEDED: 5,
  NEAR_LIMIT: 4,
  DATA_STALE: 3,
  UNKNOWN: 2,
  LIGHT_USE: 1,
  HEALTHY: 0,
};

export function toolGroupKey(toolKey: string | null, toolName: string) {
  return toolKey?.trim() || toolName.trim().toLowerCase() || "unknown";
}

function planDisplayRatio(plan: PlanUsageSubscriptionRow, includeLiveQuota: boolean) {
  if (includeLiveQuota && plan.primaryQuota?.displayRatio != null) return plan.primaryQuota.displayRatio;
  if (plan.included?.displayRatio != null) return plan.included.displayRatio;
  if (!includeLiveQuota) return null;
  return plan.primaryRatio != null ? Math.min(plan.primaryRatio, 1) : null;
}

function planPrimaryRatio(plan: PlanUsageSubscriptionRow, includeLiveQuota: boolean) {
  if (!includeLiveQuota) return plan.included?.rawRatio ?? null;
  return plan.primaryRatio;
}

function planExpectedEndAt(
  plan: PlanUsageSubscriptionRow,
  now: Date,
): string | null {
  if (plan.verdict.code !== "NEAR_LIMIT") return null;
  if (!plan.primaryQuota || plan.primaryQuota.rawRatio == null) return null;
  return projectQuotaPace(plan.primaryQuota, now).exhaustAt;
}

function seatWeight(plan: PlanUsageSubscriptionRow) {
  return Math.max(1, plan.assignedSeats || plan.seatCapacity || 1);
}

/** Seat-weighted average of plan ratios (0–1). */
function weightedAverageRatio(
  plans: PlanUsageSubscriptionRow[],
  ratioFor: (plan: PlanUsageSubscriptionRow) => number | null,
) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const plan of plans) {
    const ratio = ratioFor(plan);
    if (ratio == null) continue;
    const weight = seatWeight(plan);
    weightedSum += ratio * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) return null;
  return weightedSum / weightTotal;
}

function aggregateUtilization(
  plans: PlanUsageSubscriptionRow[],
  includeLiveQuota: boolean,
  now: Date,
) {
  const utilizationRatio = weightedAverageRatio(plans, (plan) =>
    planPrimaryRatio(plan, includeLiveQuota),
  );
  const displayRatio = weightedAverageRatio(plans, (plan) =>
    planDisplayRatio(plan, includeLiveQuota),
  );
  const utilizationPercent = utilizationRatio == null ? null : utilizationRatio * 100;
  const utilizationDisplayPercent = displayRatio == null ? null : displayRatio * 100;

  // Previous cycles must not reuse live quota pace verdicts.
  if (!includeLiveQuota) {
    return {
      utilizationPercent,
      utilizationDisplayPercent,
      verdictCode: null,
      expectedEndAt: null,
      usageWindow: null,
      projectionState: "unavailable" as const,
    };
  }

  const verdict =
    plans.reduce<PlanUsageSubscriptionRow | null>((worst, plan) => {
      if (!worst) return plan;
      return VERDICT_RANK[plan.verdict.code] > VERDICT_RANK[worst.verdict.code] ? plan : worst;
    }, null)?.verdict ?? null;

  let expectedEndAt: string | null = null;
  for (const plan of plans) {
    const at = planExpectedEndAt(plan, now);
    if (!at) continue;
    if (expectedEndAt == null || at < expectedEndAt) expectedEndAt = at;
  }

  const liveWindows = plans
    .filter((plan) => plan.primaryQuota?.resetsAt)
    .map((plan) => ({
      label: quotaWindowLabel(plan.primaryQuota!.windowType),
      windowType: plan.primaryQuota!.windowType,
      resetAt: plan.primaryQuota!.resetsAt!,
      preference: plan.usageWindowPreference,
      selectionSource: plan.usageWindowPreference === "auto" ? "auto" as const : "override" as const,
    }));
  const awaitingWindow = plans.find(
    (plan) => !plan.primaryQuota && plan.usageWindowPreference !== "auto",
  );
  const firstWindow = liveWindows[0] ?? null;
  const sameWindow = firstWindow && liveWindows.every(
    (window) => window.windowType === firstWindow.windowType && window.resetAt === firstWindow.resetAt,
  );
  const projectionState: "forming" | "reliable" | "unavailable" = plans.some((plan) => plan.projectionState === "reliable")
    ? "reliable"
    : plans.some((plan) => plan.projectionState === "forming")
      ? "forming"
      : "unavailable";

  return {
    utilizationPercent,
    utilizationDisplayPercent,
    verdictCode: verdict?.code ?? null,
    expectedEndAt,
    usageWindow: sameWindow ? firstWindow : liveWindows.length ? {
      label: "Mixed usage windows",
      windowType: "mixed",
      resetAt: liveWindows.map((window) => window.resetAt).sort()[0]!,
      preference: "mixed",
      selectionSource: "mixed" as const,
    } : awaitingWindow ? {
      label: `Awaiting ${usageWindowPreferenceLabel(awaitingWindow.usageWindowPreference)} window`,
      windowType: "unavailable",
      resetAt: "",
      preference: awaitingWindow.usageWindowPreference,
      selectionSource: "unavailable" as const,
    } : null,
    projectionState,
  };
}

/** Attach quota / allowance utilization from plan-usage rows. */
export function enrichSubscriptionCyclesWithUtilization(
  cycles: ToolSubscriptionCycleRow[],
  planSubscriptions: PlanUsageSubscriptionRow[],
  options: { includeLiveQuota?: boolean; now?: Date } = {},
): ToolSubscriptionCycleRow[] {
  const includeLiveQuota = options.includeLiveQuota !== false;
  const now = options.now ?? new Date();
  const plansByTool = new Map<string, PlanUsageSubscriptionRow[]>();
  for (const plan of planSubscriptions) {
    const key = toolGroupKey(plan.toolKey, plan.toolName);
    const group = plansByTool.get(key) ?? [];
    group.push(plan);
    plansByTool.set(key, group);
  }
  return cycles.map((row) => ({
    ...row,
    ...aggregateUtilization(plansByTool.get(row.id) ?? [], includeLiveQuota, now),
  }));
}

/**
 * Dashboard "Current cycles" should only show tools with real pressure or traffic.
 * Detected-but-unused seats with no quota window stay off the board.
 */
export function isActiveSubscriptionCycle(row: Pick<ToolSubscriptionCycleRow, "modelCalls" | "utilizationPercent">) {
  return row.modelCalls > 0 || row.utilizationPercent != null;
}

export function filterActiveSubscriptionCycles(
  cycles: ToolSubscriptionCycleRow[],
): ToolSubscriptionCycleRow[] {
  const visible = cycles.filter(isActiveSubscriptionCycle);
  const totalSpend = visible.reduce((sum, row) => sum + row.cycleSpend, 0);
  return visible.map((row) => ({
    ...row,
    spendSharePercent: totalSpend > 0 ? (row.cycleSpend / totalSpend) * 100 : 0,
  }));
}

/** Collapse plan/cycle slices into one overview row per tool. */
export function rollupSubscriptionCyclesByTool(slices: SubscriptionCycleSliceRow[]): ToolSubscriptionCycleRow[] {
  type Acc = {
    id: string;
    toolName: string;
    toolKey: string | null;
    plans: Map<string, string>;
    cycleSpend: number;
    /** Seat spend of the plan that owns billingCycle / billingCadence. */
    primarySpend: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    modelCalls: number;
    windowFrom: string;
    windowTo: string;
    billingCycle: BillingCycleInfo;
    billingCadence: string | null;
  };

  const groups = new Map<string, Acc>();

  for (const slice of slices) {
    const key = toolGroupKey(slice.toolKey, slice.toolName);
    const existing = groups.get(key);
    const sliceCadence = slice.billingCadence ?? null;
    if (!existing) {
      groups.set(key, {
        id: key,
        toolName: slice.toolName,
        toolKey: slice.toolKey,
        plans: new Map([[slice.subscriptionId, slice.name]]),
        cycleSpend: slice.cycleSpend,
        primarySpend: slice.cycleSpend,
        verifiedUsageCost: slice.verifiedUsageCost,
        estimatedApiCost: slice.estimatedApiCost,
        modelCalls: slice.modelCalls,
        windowFrom: slice.windowFrom,
        windowTo: slice.windowTo,
        billingCycle: slice.billingCycle,
        billingCadence: sliceCadence,
      });
      continue;
    }

    existing.plans.set(slice.subscriptionId, slice.name);
    existing.cycleSpend += slice.cycleSpend;
    existing.verifiedUsageCost += slice.verifiedUsageCost;
    existing.estimatedApiCost += slice.estimatedApiCost;
    existing.modelCalls += slice.modelCalls;
    if (slice.windowFrom < existing.windowFrom) existing.windowFrom = slice.windowFrom;
    if (slice.windowTo > existing.windowTo) existing.windowTo = slice.windowTo;
    // Prefer the longest seat billing period (monthly over weekly usage-derived cycles).
    // Tie-break: higher seat spend, then sooner renewal.
    const longer = slice.billingCycle.totalDays > existing.billingCycle.totalDays;
    const sameLengthHigherSpend =
      slice.billingCycle.totalDays === existing.billingCycle.totalDays &&
      slice.cycleSpend > existing.primarySpend;
    const sameLengthSameSpendSooner =
      slice.billingCycle.totalDays === existing.billingCycle.totalDays &&
      slice.cycleSpend === existing.primarySpend &&
      slice.billingCycle.nextRenewalDate < existing.billingCycle.nextRenewalDate;
    if (longer || sameLengthHigherSpend || sameLengthSameSpendSooner) {
      existing.billingCycle = slice.billingCycle;
      existing.billingCadence = sliceCadence ?? existing.billingCadence;
      existing.primarySpend = slice.cycleSpend;
    }
    if (!existing.toolKey && slice.toolKey) existing.toolKey = slice.toolKey;
    if (slice.toolName && existing.toolName.length < slice.toolName.length) {
      existing.toolName = slice.toolName;
    }
  }

  const totalSpend = Array.from(groups.values()).reduce((sum, row) => sum + row.cycleSpend, 0);

  return Array.from(groups.values())
    .map((row) => {
      const planNames = Array.from(row.plans.values()).sort((a, b) => a.localeCompare(b));
      return {
        id: row.id,
        toolName: row.toolName,
        toolKey: row.toolKey,
        planNames,
        planCount: planNames.length,
        cycleSpend: row.cycleSpend,
        verifiedUsageCost: row.verifiedUsageCost,
        estimatedApiCost: row.estimatedApiCost,
        modelCalls: row.modelCalls,
        windowFrom: row.windowFrom,
        windowTo: row.windowTo,
        spendSharePercent: totalSpend > 0 ? (row.cycleSpend / totalSpend) * 100 : 0,
        utilizationPercent: null,
        utilizationDisplayPercent: null,
        verdictCode: null,
        expectedEndAt: null,
        billingCycle: row.billingCycle,
        billingCadence: row.billingCadence,
        usageWindow: null,
        projectionState: "unavailable" as const,
      };
    })
    .sort((a, b) => b.cycleSpend - a.cycleSpend || a.toolName.localeCompare(b.toolName));
}
