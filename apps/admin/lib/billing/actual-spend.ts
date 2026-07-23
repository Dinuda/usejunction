import { DAY_MS, utcDateOnly, usageExclusiveEnd, usageInclusiveEnd } from "@/lib/metrics/date-range";
import {
  addCycles,
  resolveBillingCycle,
  resolveBillingCycleOffset,
  type BillingCycle,
} from "@/lib/billing/cycles";

export type SubscriptionSeatRow = {
  id?: string;
  name?: string;
  toolName?: string | null;
  toolKey?: string | null;
  billingCadence: string;
  billingCycleAnchorDate: Date | null;
  billingCycleDays?: number | null;
  cycleSeatMicros: bigint;
  seatCount: number;
  /** When the subscription was configured — no spend attributed before this. */
  startDate: Date;
  endDate: Date | null;
};

export type ActualSpendBreakdown = {
  /** Full cycle dollars for active coding subscriptions (purchased-seat commitment). */
  total: number;
  basis: "subscriptions" | "none";
  cycles: Array<{
    id?: string;
    name?: string;
    toolName?: string | null;
    toolKey?: string | null;
    cycle: BillingCycle;
    spendMicros: bigint;
  }>;
};

export function microsToDollars(micros: bigint) {
  return Number(micros) / 1_000_000;
}

/** True when the subscription overlaps the period and has started by period end. */
export function subscriptionActiveInPeriod(row: SubscriptionSeatRow, from: Date, to: Date) {
  if (row.seatCount <= 0 || row.cycleSeatMicros <= BigInt(0)) return false;
  const start = utcDateOnly(row.startDate);
  const end = row.endDate ? utcDateOnly(row.endDate) : null;
  const rangeStart = utcDateOnly(from);
  const rangeEnd = usageInclusiveEnd(to);
  if (start > rangeEnd) return false;
  if (end && end <= rangeStart) return false;
  return true;
}

/** Sum full cycle seat cost for each subscription active in the period. */
export function cycleSubscriptionMicros(rows: SubscriptionSeatRow[], from: Date, to: Date): bigint {
  let total = BigInt(0);
  for (const row of rows) {
    if (!subscriptionActiveInPeriod(row, from, to)) continue;
    total += row.cycleSeatMicros * BigInt(row.seatCount);
  }
  return total;
}

/**
 * Subscription commitment = full current-cycle coding-subscription cost.
 * Not prorated by calendar day. Only subscriptions that have started by period end.
 */
export function computeActualSpend(input: {
  subscriptions: SubscriptionSeatRow[];
  from: Date;
  to: Date;
  now?: Date;
}): ActualSpendBreakdown {
  const cycles = input.subscriptions
    .filter((row) => subscriptionActiveInPeriod(row, input.from, input.to))
    .map((row) => ({
      id: row.id,
      name: row.name,
      toolName: row.toolName,
      toolKey: row.toolKey,
      cycle: resolveBillingCycle(row, input.now ?? input.to),
      spendMicros: row.cycleSeatMicros * BigInt(row.seatCount),
    }));
  const micros = cycles.reduce((sum, row) => sum + row.spendMicros, BigInt(0));
  return {
    total: microsToDollars(micros),
    basis: micros > BigInt(0) ? "subscriptions" : "none",
    cycles,
  };
}

/** Keep only coding-tool subscriptions for cycle spend. */
export function filterCycleCodingSubscriptions<
  T extends { billingCadence: string; toolKey?: string | null; toolName?: string | null },
>(plans: T[], isCodingTool: (keyOrName: string | null | undefined) => boolean): T[] {
  return plans.filter(
    (plan) =>
      isCodingTool(plan.toolKey ?? plan.toolName ?? null),
  );
}

export function observationCoverage(input: {
  rangeDays: number;
  daysWithActivity: number;
  firstActivityDate: string | null;
  from: Date;
}) {
  const fromIso = utcDateOnly(input.from).toISOString().slice(0, 10);
  const partialWindow =
    Boolean(input.firstActivityDate && input.firstActivityDate > fromIso) ||
    (input.daysWithActivity > 0 && input.daysWithActivity < input.rangeDays);
  return {
    rangeDays: input.rangeDays,
    daysWithActivity: input.daysWithActivity,
    firstActivityDate: input.firstActivityDate,
    partialWindow,
  };
}

/**
 * Personal subscription commitment from a developer's assigned seats.
 * Mirrors org cycle commitment: full cycle cost for current/previous views,
 * calendar-prorated for last_30_days windows.
 */
export function computePersonalSeatCommitment(input: {
  assignments: SubscriptionSeatRow[];
  view: "current_cycles" | "previous_cycles" | "last_30_days";
  from: Date;
  to: Date;
}): number {
  const from = utcDateOnly(input.from);
  const toExclusive = usageExclusiveEnd(input.to);
  let total = BigInt(0);

  for (const row of input.assignments) {
    if (row.seatCount <= 0 || row.cycleSeatMicros <= BigInt(0)) continue;
    const fullSpend = row.cycleSeatMicros * BigInt(row.seatCount);

    if (input.view !== "last_30_days") {
      if (!subscriptionActiveInPeriod(row, input.from, input.to)) continue;
      total += fullSpend;
      continue;
    }

    let cursor = resolveBillingCycleOffset(row, from, 0);
    while (cursor.cycleStart < toExclusive) {
      const overlapStart = Math.max(cursor.cycleStart.getTime(), from.getTime());
      const overlapEnd = Math.min(cursor.cycleEnd.getTime(), toExclusive.getTime());
      const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / DAY_MS));
      if (
        overlapDays > 0 &&
        subscriptionActiveInPeriod(row, new Date(overlapStart), new Date(overlapEnd - DAY_MS))
      ) {
        const ratio = overlapDays / Math.max(1, cursor.totalDays);
        total += BigInt(Math.round(Number(fullSpend) * ratio));
      }
      const nextStart = cursor.cycleEnd;
      const nextEnd = addCycles(nextStart, row.billingCadence, 1, row.billingCycleDays);
      cursor = {
        cycleStart: nextStart,
        cycleEnd: nextEnd,
        nextRenewalDate: nextEnd,
        elapsedPercent: 1,
        remainingDays: 0,
        totalDays: Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / DAY_MS)),
      };
    }
  }

  return microsToDollars(total);
}
