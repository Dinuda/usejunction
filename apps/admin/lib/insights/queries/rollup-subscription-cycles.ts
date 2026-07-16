import type { PlanVerdict, PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import type { BillingCycleInfo, PlanUsageSubscriptionRow } from "@/lib/insights/contracts/plan-usage.v1";

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
  billingCycle: BillingCycleInfo;
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

function planDisplayRatio(plan: PlanUsageSubscriptionRow) {
  if (plan.primaryQuota?.displayRatio != null) return plan.primaryQuota.displayRatio;
  if (plan.included?.displayRatio != null) return plan.included.displayRatio;
  return plan.primaryRatio != null ? Math.min(plan.primaryRatio, 1) : null;
}

function aggregateUtilization(plans: PlanUsageSubscriptionRow[]) {
  const withSignal = plans.filter((plan) => plan.primaryRatio != null);
  const withDisplay = plans.map(planDisplayRatio).filter((ratio): ratio is number => ratio != null);
  const utilizationPercent =
    withSignal.length > 0
      ? (withSignal.reduce((sum, plan) => sum + (plan.primaryRatio ?? 0), 0) / withSignal.length) * 100
      : null;
  const utilizationDisplayPercent =
    withDisplay.length > 0
      ? (withDisplay.reduce((sum, ratio) => sum + ratio, 0) / withDisplay.length) * 100
      : null;
  const verdict =
    plans.reduce<PlanUsageSubscriptionRow | null>((worst, plan) => {
      if (!worst) return plan;
      return VERDICT_RANK[plan.verdict.code] > VERDICT_RANK[worst.verdict.code] ? plan : worst;
    }, null)?.verdict ?? null;
  return { utilizationPercent, utilizationDisplayPercent, verdictCode: verdict?.code ?? null };
}

/** Attach quota / allowance utilization from plan-usage rows. */
export function enrichSubscriptionCyclesWithUtilization(
  cycles: ToolSubscriptionCycleRow[],
  planSubscriptions: PlanUsageSubscriptionRow[],
): ToolSubscriptionCycleRow[] {
  const plansByTool = new Map<string, PlanUsageSubscriptionRow[]>();
  for (const plan of planSubscriptions) {
    const key = toolGroupKey(plan.toolKey, plan.toolName);
    const group = plansByTool.get(key) ?? [];
    group.push(plan);
    plansByTool.set(key, group);
  }
  return cycles.map((row) => ({
    ...row,
    ...aggregateUtilization(plansByTool.get(row.id) ?? []),
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
    verifiedUsageCost: number;
    estimatedApiCost: number;
    modelCalls: number;
    windowFrom: string;
    windowTo: string;
    billingCycle: BillingCycleInfo;
  };

  const groups = new Map<string, Acc>();

  for (const slice of slices) {
    const key = toolGroupKey(slice.toolKey, slice.toolName);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        toolName: slice.toolName,
        toolKey: slice.toolKey,
        plans: new Map([[slice.subscriptionId, slice.name]]),
        cycleSpend: slice.cycleSpend,
        verifiedUsageCost: slice.verifiedUsageCost,
        estimatedApiCost: slice.estimatedApiCost,
        modelCalls: slice.modelCalls,
        windowFrom: slice.windowFrom,
        windowTo: slice.windowTo,
        billingCycle: slice.billingCycle,
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
    if (slice.billingCycle.nextRenewalDate < existing.billingCycle.nextRenewalDate) {
      existing.billingCycle = slice.billingCycle;
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
        billingCycle: row.billingCycle,
      };
    })
    .sort((a, b) => b.cycleSpend - a.cycleSpend || a.toolName.localeCompare(b.toolName));
}
