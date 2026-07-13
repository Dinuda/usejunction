import type { DeveloperPlanAssignment, UsageDaily } from "@usejunction/db";

export const BILLING_CALCULATION_VERSION = "manual-v1";
const MICROS_PER_MILLION = BigInt(1_000_000);
const DAY_MS = 86_400_000;
const USAGE_SOURCE_PRIORITY: Record<string, number> = { vendor_verified: 0, gateway_observed: 1, otel_observed: 2, device_observed: 3, estimated: 4, admin_confirmed: 5 };

export type BillingUsageRow = Pick<UsageDaily, "date" | "source" | "costMicros" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "observedAt">;
export type BillingAssignmentRow = Pick<DeveloperPlanAssignment,
  | "id" | "developerId" | "provider" | "product" | "toolName" | "planName" | "planTier" | "currency"
  | "monthlySeatMicros" | "includedMonthlyMicros" | "inputRateMicrosPerMillion" | "outputRateMicrosPerMillion"
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
  month: string;
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

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function daysInMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
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

function activeDaysInMonth(assignment: BillingAssignmentRow, month: Date, range?: { from?: Date; to?: Date }) {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const rangeStart = range?.from ? utcDay(range.from) : monthStart;
  const rangeEnd = range?.to ? new Date(utcDay(range.to).getTime() + DAY_MS) : monthEnd;
  const start = maxDate(maxDate(monthStart, utcDay(assignment.startDate)), rangeStart);
  const end = minDate(minDate(monthEnd, assignment.endDate ? utcDay(assignment.endDate) : monthEnd), rangeEnd);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
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
    const months = new Set<string>();
    const start = maxDate(utcDay(assignment.startDate), input.from ? utcDay(input.from) : utcDay(assignment.startDate));
    const requestedEnd = input.to ? new Date(utcDay(input.to).getTime() + DAY_MS) : new Date(Date.now() + 366 * DAY_MS);
    const end = minDate(assignment.endDate ? utcDay(assignment.endDate) : requestedEnd, requestedEnd);
    for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor < end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
      months.add(monthKey(cursor));
    }
    for (const row of usage) {
      if (row.developerId !== assignment.developerId || row.provider !== assignment.provider || row.product !== assignment.product || row.toolName !== assignment.toolName || !isActiveOn(assignment, row.date)) continue;
      months.add(monthKey(row.date));
    }
    for (const month of months) {
      const [year, monthNumber] = month.split("-").map(Number);
      const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
      const rows = usage.filter((row) => row.developerId === assignment.developerId && row.provider === assignment.provider && row.product === assignment.product && row.toolName === assignment.toolName && monthKey(row.date) === month && isActiveOn(assignment, row.date));
      const inputTokens = rows.reduce((total, row) => total + row.inputTokens, BigInt(0));
      const outputTokens = rows.reduce((total, row) => total + row.outputTokens, BigInt(0));
      const cacheReadTokens = rows.reduce((total, row) => total + row.cacheReadTokens, BigInt(0));
      const grossUsageMicros = charge(inputTokens, assignment.inputRateMicrosPerMillion) + charge(outputTokens, assignment.outputRateMicrosPerMillion) + charge(cacheReadTokens, assignment.cacheRateMicrosPerMillion);
      const includedCreditsMicros = grossUsageMicros < assignment.includedMonthlyMicros ? grossUsageMicros : assignment.includedMonthlyMicros;
      const grossSeatMicros = assignment.monthlySeatMicros * BigInt(activeDaysInMonth(assignment, monthDate, { from: input.from, to: input.to })) * BigInt(Math.max(0, assignment.seatCount)) / BigInt(daysInMonth(monthDate));
      const key = `${assignment.id}:${month}`;
      lines.set(key, {
        assignmentId: assignment.id,
        developerId: assignment.developerId,
        provider: assignment.provider,
        product: assignment.product,
        toolName: assignment.toolName,
        planName: assignment.planName,
        planTier: assignment.planTier,
        currency: assignment.currency,
        month,
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
  return Array.from(lines.values()).sort((a, b) => a.month.localeCompare(b.month) || a.toolName.localeCompare(b.toolName));
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
