import type { DeveloperPlanAssignment, UsageDaily } from "@usejunction/db";
import { addCycles, resolveBillingCycle } from "@/lib/billing/cycles";

export const BILLING_CALCULATION_VERSION = "cycle-v1";
const MICROS_PER_MILLION = BigInt(1_000_000);
const DAY_MS = 86_400_000;
const USAGE_SOURCE_PRIORITY: Record<string, number> = { vendor_verified: 0, gateway_observed: 1, otel_observed: 2, device_observed: 3, estimated: 4, admin_confirmed: 5 };

export type BillingUsageRow = Pick<UsageDaily, "date" | "source" | "costMicros" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "observedAt">;
export type BillingAssignmentRow = Pick<DeveloperPlanAssignment,
  | "id" | "developerId" | "provider" | "product" | "toolName" | "planName" | "planTier" | "currency"
  | "billingCadence" | "billingCycleAnchorDate" | "billingCycleDays" | "cycleSeatMicros" | "includedCycleMicros" | "inputRateMicrosPerMillion" | "outputRateMicrosPerMillion"
  | "cacheRateMicrosPerMillion" | "seatCount" | "seatStatus" | "startDate" | "endDate" | "source" | "active"
>;

export type BillingLine = {
  assignmentId: string;
  developerId: string;
  provider: string;
  product: string;
  toolName: string;
  planName: string;
  planTier: string | null;
  currency: string;
  cycleStart: string;
  cycleEnd: string;
  grossSeatMicros: bigint;
  grossUsageMicros: bigint;
  includedCreditsMicros: bigint;
  netMicros: bigint;
  usageRows: number;
  freshness: Date | null;
  source: string;
  calculationVersion: string;
};

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}

function isActiveOn(assignment: BillingAssignmentRow, date: Date) {
  const day = utcDay(date);
  return utcDay(assignment.startDate) <= day && (!assignment.endDate || day < utcDay(assignment.endDate));
}

function charge(tokens: bigint, rateMicrosPerMillion: bigint) {
  return tokens * rateMicrosPerMillion / MICROS_PER_MILLION;
}

function dayKey(date: Date) {
  return utcDay(date).toISOString().slice(0, 10);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

export function calculateBilling(input: {
  assignments: BillingAssignmentRow[];
  usage: (BillingUsageRow & { developerId: string | null; provider: string; product: string; toolName: string })[];
  from?: Date;
  to?: Date;
}) {
  const preferredSources = new Map<string, number>();
  for (const row of input.usage) {
    const key = `${row.developerId ?? ""}:${row.provider}:${row.product}:${row.toolName}:${utcDay(row.date).toISOString()}`;
    preferredSources.set(key, Math.min(preferredSources.get(key) ?? 99, USAGE_SOURCE_PRIORITY[row.source] ?? 99));
  }
  const usage = input.usage.filter((row) => {
    const key = `${row.developerId ?? ""}:${row.provider}:${row.product}:${row.toolName}:${utcDay(row.date).toISOString()}`;
    return (USAGE_SOURCE_PRIORITY[row.source] ?? 99) === preferredSources.get(key);
  });
  const lines = new Map<string, BillingLine>();
  for (const assignment of input.assignments) {
    const requestedStart = input.from ? utcDay(input.from) : utcDay(assignment.startDate);
    const requestedEnd = input.to ? new Date(utcDay(input.to).getTime() + DAY_MS) : new Date(utcDay(new Date()).getTime() + DAY_MS);
    const activeStart = utcDay(assignment.startDate);
    const activeEnd = assignment.endDate ? utcDay(assignment.endDate) : requestedEnd;
    const start = maxDate(requestedStart, activeStart);
    const end = minDate(requestedEnd, activeEnd);
    if (start >= end) continue;

    let cycle = resolveBillingCycle(assignment, start);
    while (cycle.cycleEnd <= start) {
      const nextStart = cycle.cycleEnd;
      cycle = {
        ...cycle,
        cycleStart: nextStart,
        cycleEnd: addCycles(nextStart, assignment.billingCadence, 1, assignment.billingCycleDays),
      };
    }

    for (let cycleStart = cycle.cycleStart, cycleEnd = cycle.cycleEnd; cycleStart < end; cycleStart = cycleEnd, cycleEnd = addCycles(cycleEnd, assignment.billingCadence, 1, assignment.billingCycleDays)) {
      if (!overlaps(cycleStart, cycleEnd, activeStart, activeEnd) || !overlaps(cycleStart, cycleEnd, requestedStart, requestedEnd)) continue;
      const rows = usage.filter((row) =>
        row.developerId === assignment.developerId &&
        row.provider === assignment.provider &&
        row.product === assignment.product &&
        row.toolName === assignment.toolName &&
        utcDay(row.date) >= cycleStart &&
        utcDay(row.date) < cycleEnd &&
        isActiveOn(assignment, row.date)
      );
      const inputTokens = rows.reduce((total, row) => total + row.inputTokens, BigInt(0));
      const outputTokens = rows.reduce((total, row) => total + row.outputTokens, BigInt(0));
      const cacheReadTokens = rows.reduce((total, row) => total + row.cacheReadTokens, BigInt(0));
      const grossUsageMicros = charge(inputTokens, assignment.inputRateMicrosPerMillion) + charge(outputTokens, assignment.outputRateMicrosPerMillion) + charge(cacheReadTokens, assignment.cacheRateMicrosPerMillion);
      const includedCreditsMicros = grossUsageMicros < assignment.includedCycleMicros ? grossUsageMicros : assignment.includedCycleMicros;
      const grossSeatMicros = assignment.cycleSeatMicros * BigInt(Math.max(0, assignment.seatCount));
      const key = `${assignment.id}:${dayKey(cycleStart)}`;
      lines.set(key, {
        assignmentId: assignment.id,
        developerId: assignment.developerId,
        provider: assignment.provider,
        product: assignment.product,
        toolName: assignment.toolName,
        planName: assignment.planName,
        planTier: assignment.planTier,
        currency: assignment.currency,
        cycleStart: dayKey(cycleStart),
        cycleEnd: dayKey(cycleEnd),
        grossSeatMicros,
        grossUsageMicros,
        includedCreditsMicros,
        netMicros: grossSeatMicros + grossUsageMicros - includedCreditsMicros,
        usageRows: rows.length,
        freshness: rows.reduce<Date | null>((latest, row) => !latest || row.observedAt > latest ? row.observedAt : latest, null),
        source: assignment.source,
        calculationVersion: BILLING_CALCULATION_VERSION,
      });
    }
  }
  return Array.from(lines.values()).sort((a, b) => a.cycleStart.localeCompare(b.cycleStart) || a.toolName.localeCompare(b.toolName));
}

export function serializeBillingLine(line: BillingLine) {
  return {
    ...line,
    grossSeatMicros: line.grossSeatMicros.toString(),
    grossUsageMicros: line.grossUsageMicros.toString(),
    includedCreditsMicros: line.includedCreditsMicros.toString(),
    netMicros: line.netMicros.toString(),
    freshness: line.freshness?.toISOString() ?? null,
  };
}
