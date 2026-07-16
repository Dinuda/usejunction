import { DAY_MS, utcDateOnly } from "@/lib/metrics/date-range";

export type BillingCadence = "weekly" | "monthly" | "annual" | "custom";

export type BillingCycle = {
  cycleStart: Date;
  cycleEnd: Date;
  nextRenewalDate: Date;
  elapsedPercent: number;
  remainingDays: number;
  totalDays: number;
};

export type BillingCycleInput = {
  billingCadence: string;
  billingCycleAnchorDate: Date | null;
  billingCycleDays?: number | null;
  createdAt?: Date | null;
};

export function normalizeBillingCadence(value: string | null | undefined): BillingCadence {
  if (value === "weekly" || value === "annual" || value === "custom") return value;
  return "monthly";
}

export function cycleAnchor(input: Pick<BillingCycleInput, "billingCycleAnchorDate" | "createdAt">, fallback = new Date()) {
  return utcDateOnly(input.billingCycleAnchorDate ?? input.createdAt ?? fallback);
}

export function cadenceCycleDays(cadence: string, customDays?: number | null) {
  const normalized = normalizeBillingCadence(cadence);
  if (normalized === "weekly") return 7;
  if (normalized === "annual") return 365;
  if (normalized === "custom") return Math.max(1, Math.floor(customDays ?? 30));
  return null;
}

function addMonths(date: Date, months: number) {
  const source = utcDateOnly(date);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function addCycles(anchor: Date, cadence: string, count: number, customDays?: number | null) {
  const normalized = normalizeBillingCadence(cadence);
  if (normalized === "monthly") return addMonths(anchor, count);
  if (normalized === "annual") return addMonths(anchor, count * 12);
  const days = cadenceCycleDays(normalized, customDays) ?? 30;
  return new Date(utcDateOnly(anchor).getTime() + count * days * DAY_MS);
}

export function resolveBillingCycle(input: BillingCycleInput, now = new Date()): BillingCycle {
  const anchor = cycleAnchor(input, now);
  const today = utcDateOnly(now);
  let cycleStart = anchor;
  let cycleEnd = addCycles(anchor, input.billingCadence, 1, input.billingCycleDays);

  if (today < cycleStart) {
    while (today < cycleStart) {
      cycleEnd = cycleStart;
      cycleStart = addCycles(cycleStart, input.billingCadence, -1, input.billingCycleDays);
    }
  } else {
    while (today >= cycleEnd) {
      cycleStart = cycleEnd;
      cycleEnd = addCycles(cycleEnd, input.billingCadence, 1, input.billingCycleDays);
    }
  }

  const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.floor((today.getTime() - cycleStart.getTime()) / DAY_MS) + 1));
  return {
    cycleStart,
    cycleEnd,
    nextRenewalDate: cycleEnd,
    elapsedPercent: elapsedDays / totalDays,
    remainingDays: Math.max(0, Math.ceil((cycleEnd.getTime() - today.getTime()) / DAY_MS)),
    totalDays,
  };
}

export function resolveBillingCycleOffset(input: BillingCycleInput, now = new Date(), offset = 0): BillingCycle {
  const current = resolveBillingCycle(input, now);
  if (offset === 0) return current;
  const cycleStart = addCycles(current.cycleStart, input.billingCadence, offset, input.billingCycleDays);
  const cycleEnd = addCycles(current.cycleEnd, input.billingCadence, offset, input.billingCycleDays);
  const today = utcDateOnly(now);
  const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.floor((today.getTime() - cycleStart.getTime()) / DAY_MS) + 1));
  return {
    cycleStart,
    cycleEnd,
    nextRenewalDate: cycleEnd,
    elapsedPercent: elapsedDays / totalDays,
    remainingDays: Math.max(0, Math.ceil((cycleEnd.getTime() - today.getTime()) / DAY_MS)),
    totalDays,
  };
}

export function cycleFromNextRenewal(input: {
  nextRenewalDate: Date;
  billingCadence: string;
  billingCycleDays?: number | null;
}) {
  return addCycles(input.nextRenewalDate, input.billingCadence, -1, input.billingCycleDays);
}

export function cycleToJson(cycle: BillingCycle) {
  return {
    cycleStart: cycle.cycleStart.toISOString().slice(0, 10),
    cycleEnd: cycle.cycleEnd.toISOString().slice(0, 10),
    nextRenewalDate: cycle.nextRenewalDate.toISOString().slice(0, 10),
    elapsedPercent: cycle.elapsedPercent,
    remainingDays: cycle.remainingDays,
    totalDays: cycle.totalDays,
  };
}
