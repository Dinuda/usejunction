import type { OrgOverviewV1 } from "@/lib/insights";
import type { BillingCycleInfo, UsageWindowMetadata } from "@/lib/insights/contracts/plan-usage.v1";
import type { PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import { paceToPlanVerdictCode } from "@/lib/quotas/pace";
import type { MemberPlanBoardCard } from "@/lib/quotas/plan-board";
import { DAY_MS, utcDateOnly } from "@/lib/metrics/date-range";

type CycleRow = OrgOverviewV1["subscriptionCycles"][number];

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function personalVerdictCode(card: MemberPlanBoardCard): PlanVerdictCode | null {
  const used = card.pace.usedPercent;
  if (used != null && used >= 100) return "LIMIT_EXCEEDED";
  const fromPace = paceToPlanVerdictCode(card.pace.code);
  if (fromPace) return fromPace;
  if (used == null) return null;
  if (used >= 90) return "NEAR_LIMIT";
  if (used <= 25) return "LIGHT_USE";
  return "HEALTHY";
}

function billingCycleInfo(card: MemberPlanBoardCard, now: Date): BillingCycleInfo {
  const cycle = card.billingCycle;
  if (cycle) {
    const start = utcDateOnly(new Date(cycle.cycleStart));
    const end = utcDateOnly(new Date(cycle.cycleEnd));
    const totalDays = Math.max(
      1,
      cycle.totalDays || Math.round((end.getTime() - start.getTime()) / DAY_MS),
    );
    const elapsedDays = Math.max(
      0,
      Math.min(totalDays, Math.round((utcDateOnly(now).getTime() - start.getTime()) / DAY_MS)),
    );
    return {
      cycleStart: cycle.cycleStart,
      cycleEnd: cycle.cycleEnd,
      nextRenewalDate: cycle.nextRenewalDate,
      elapsedPercent: elapsedDays / totalDays,
      remainingDays: Math.max(0, totalDays - elapsedDays),
      totalDays,
    };
  }

  const resetAt = card.primary?.resetsAt ?? card.pace.resetsAt;
  const fallback = resetAt ?? now.toISOString();
  return {
    cycleStart: fallback,
    cycleEnd: fallback,
    nextRenewalDate: fallback,
    elapsedPercent: 0,
    remainingDays: 0,
    totalDays: 1,
  };
}

function usageWindowMeta(card: MemberPlanBoardCard): UsageWindowMetadata | null {
  if (!card.primary) return null;
  const preference = card.usageWindowPreference || "auto";
  return {
    windowType: card.primary.windowType,
    label: card.primary.windowLabel,
    resetAt: card.primary.resetsAt,
    preference,
    selectionSource: preference === "auto" ? "auto" : "override",
  };
}

/**
 * Adapt personal plan-board cards into the team Current cycles row shape
 * so You can reuse CoverageVsNeedSection.
 */
export function personalPlanCardsToCycles(
  cards: MemberPlanBoardCard[],
  seatCostByTool: Record<string, number> = {},
  now: Date = new Date(),
): CycleRow[] {
  return cards.map((card) => {
    const used = card.pace.usedPercent;
    const cycle = billingCycleInfo(card, now);
    const verifiedUsageCost = card.usage?.verifiedUsageCost ?? 0;
    const estimatedApiCost = card.usage?.estimatedApiCost ?? 0;
    return {
      id: card.toolKey,
      toolName: card.toolName,
      toolKey: card.toolKey,
      planNames: card.planName ? [card.planName] : [],
      planCount: card.planName ? 1 : 0,
      cycleSpend: seatCostByTool[card.toolKey] ?? 0,
      verifiedUsageCost,
      estimatedApiCost,
      modelCalls: card.usage?.requests ?? 0,
      windowFrom: cycle.cycleStart,
      windowTo: cycle.cycleEnd,
      spendSharePercent: 0,
      utilizationPercent: used,
      utilizationDisplayPercent: used == null ? null : clampPercent(used),
      verdictCode: personalVerdictCode(card),
      expectedEndAt: card.pace.exhaustAt,
      billingCycle: cycle,
      billingCadence: card.billingCycle?.billingCadence ?? null,
      usageWindow: usageWindowMeta(card),
      projectionState: card.pace.projectionState,
    };
  });
}
