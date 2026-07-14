import { utcDateOnly, usageInclusiveEnd } from "@/lib/metrics/date-range";

export type SubscriptionSeatRow = {
  monthlySeatMicros: bigint;
  seatCount: number;
  /** When the subscription was configured — no spend attributed before this. */
  startDate: Date;
  endDate: Date | null;
};

export type ActualSpendBreakdown = {
  /** Full monthly dollars for active coding subscriptions (not prorated by day). */
  total: number;
  basis: "subscriptions" | "none";
};

export function microsToDollars(micros: bigint) {
  return Number(micros) / 1_000_000;
}

/** True when the subscription overlaps the period and has started by period end. */
export function subscriptionActiveInPeriod(row: SubscriptionSeatRow, from: Date, to: Date) {
  if (row.seatCount <= 0 || row.monthlySeatMicros <= BigInt(0)) return false;
  const start = utcDateOnly(row.startDate);
  const end = row.endDate ? utcDateOnly(row.endDate) : null;
  const rangeStart = utcDateOnly(from);
  const rangeEnd = usageInclusiveEnd(to);
  if (start > rangeEnd) return false;
  if (end && end <= rangeStart) return false;
  return true;
}

/** Sum full monthly seat cost for each subscription active in the period. */
export function monthlySubscriptionMicros(rows: SubscriptionSeatRow[], from: Date, to: Date): bigint {
  let total = BigInt(0);
  for (const row of rows) {
    if (!subscriptionActiveInPeriod(row, from, to)) continue;
    total += row.monthlySeatMicros * BigInt(row.seatCount);
  }
  return total;
}

/**
 * Actual spend = full monthly coding-subscription cost.
 * Not prorated by calendar day. Only subscriptions that have started by period end.
 */
export function computeActualSpend(input: {
  subscriptions: SubscriptionSeatRow[];
  from: Date;
  to: Date;
}): ActualSpendBreakdown {
  const micros = monthlySubscriptionMicros(input.subscriptions, input.from, input.to);
  return {
    total: microsToDollars(micros),
    basis: micros > BigInt(0) ? "subscriptions" : "none",
  };
}

/** Keep only monthly-billed coding-tool subscriptions for Actual spend. */
export function filterMonthlyCodingSubscriptions<
  T extends { billingCadence: string; toolKey?: string | null; toolName?: string | null },
>(plans: T[], isCodingTool: (keyOrName: string | null | undefined) => boolean): T[] {
  return plans.filter(
    (plan) =>
      plan.billingCadence === "monthly" &&
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
