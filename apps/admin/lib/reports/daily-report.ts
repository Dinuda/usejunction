import { prisma } from "@usejunction/db";
import {
  dedupeQuotaUtilizations,
  evaluatePlanUtilization,
  mapQuotaSnapshots,
  selectPrimaryQuota,
  verdictHint,
  type PlanVerdictCode,
} from "@/lib/billing/plan-utilization-policy";
import { readQuotas } from "@/lib/insights/readers/quotas";
import {
  addLocalDays,
  localDateString,
  normalizeTimeZone,
  weekRangeEndingOnOrBefore,
} from "@/lib/timezone";
import { canonicalToolKey, toolDisplayName } from "@/lib/tools/catalog";
import {
  getWowWeekStrip,
  wowStripToSeries,
  type WowWeekStripV1,
} from "@/lib/reports/wow-week-strip";
import { readCanonicalReportUsage } from "@/lib/reports/canonical-usage";

/**
 * Agent ingest stores `usageDaily.date` as the local calendar YYYY-MM-DD
 * (UTC midnight of that calendar day). Never spill into adjacent days —
 * that reattributes yesterday as "today" when today's key is still empty.
 */
export function usageDateKeysForLocalDates(localDates: string[]): Date[] {
  const unique = new Map<string, Date>();
  for (const localDate of localDates) {
    const date = dateOnlyUtc(new Date(`${localDate}T00:00:00.000Z`));
    unique.set(date.toISOString(), date);
  }
  return [...unique.values()];
}

export type DailyReportKind = "personal" | "org";
export type DailyReportPeriod = "day" | "week";
export type { WowWeekStripV1 };

export type DailyReportSeriesPoint = {
  label: string;
  requests: number;
  tokens: number;
  cost: number;
};

/** Chart series metric — tokens preferred so the curve reads as activity, not a rising bill. */
export type ReportChartMetric = "tokens" | "cost" | "requests";

export type DailyReportToolRow = {
  toolName: string;
  displayName: string;
  requests: number;
  tokens: number;
  cost: number;
  /** Share of period spend, 0–100. */
  sharePercent: number;
  /** Share of period tokens, 0–100. */
  tokenSharePercent: number;
};

export type DailyReportPlanTool = {
  toolName: string;
  displayName: string;
  usedPercent: number | null;
  statusLabel: string;
  withinAllowance: boolean | null;
};

export type DailyReportPlanStatus = {
  /** Avg primary-window utilization across tools with signal, 0–100+. */
  usedPercent: number | null;
  /** Plan allowance status: Within allowance / Near limit / Over quota / … */
  statusLabel: string;
  /** true = within included allowance, false = near limit or over, null = unknown/stale. */
  withinAllowance: boolean | null;
  hint: string | null;
  tools: DailyReportPlanTool[];
};

export type DailyReportPayload = {
  kind: DailyReportKind;
  /** day = personal/today; week = team weekly rollup */
  period: DailyReportPeriod;
  localDate: string;
  /** Inclusive Mon–Sun bounds when period is week (`localDate` is the Sunday end). */
  weekStart?: string;
  weekEnd?: string;
  timeZone: string;
  title: string;
  subtitle: string;
  kpis: {
    requests: number;
    tokens: number;
    cost: number;
    tools: number;
    requestsDeltaPct: number | null;
    tokensDeltaPct: number | null;
    costDeltaPct: number | null;
    /** @deprecated Prefer `plan.usedPercent` — kept for API compat. */
    planUsedPercent: number | null;
    /**
     * Accepted / suggested lines from productivity ingest (0–100).
     * Closest proxy we have for “productive effectivity.”
     */
    acceptancePercent: number | null;
  };
  /** Live provider quota + plan-allowance verdict (primary windows only). */
  plan: DailyReportPlanStatus | null;
  series: DailyReportSeriesPoint[];
  /** Mon–Sun intensity strip with week-over-week deltas (preferred chart). */
  wowStrip: WowWeekStripV1 | null;
  topTools: DailyReportToolRow[];
  membersActive?: number;
};

function localDatesInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return dates;
}

function dateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

async function readAcceptancePercent(input: {
  orgId: string;
  developerId?: string | null;
  dates: Date[];
}): Promise<number | null> {
  if (input.dates.length === 0) return null;
  const rows = await prisma.usageDaily.findMany({
    where: {
      orgId: input.orgId,
      date: { in: input.dates },
      metricKind: "productivity",
      ...(input.developerId ? { developerId: input.developerId } : {}),
    },
    select: { suggestedLines: true, acceptedLines: true },
  });
  let suggested = 0;
  let accepted = 0;
  for (const row of rows) {
    suggested += Number(row.suggestedLines);
    accepted += Number(row.acceptedLines);
  }
  if (suggested <= 0) return null;
  return (accepted / suggested) * 100;
}

const VERDICT_RANK: Record<PlanVerdictCode, number> = {
  LIMIT_EXCEEDED: 5,
  NEAR_LIMIT: 4,
  DATA_STALE: 3,
  UNKNOWN: 2,
  LIGHT_USE: 1,
  HEALTHY: 0,
};

/** Fleet-style status: HEALTHY and LIGHT_USE both count as within allowance. */
export function reportPlanStatusLabel(code: PlanVerdictCode): {
  statusLabel: string;
  withinAllowance: boolean | null;
} {
  switch (code) {
    case "LIGHT_USE":
    case "HEALTHY":
      return { statusLabel: "Within allowance", withinAllowance: true };
    case "NEAR_LIMIT":
      return { statusLabel: "Near limit", withinAllowance: false };
    case "LIMIT_EXCEEDED":
      return { statusLabel: "Over quota", withinAllowance: false };
    case "DATA_STALE":
      return { statusLabel: "No quota data", withinAllowance: null };
    default:
      return { statusLabel: "No quota data", withinAllowance: null };
  }
}

/**
 * Primary-window plan utilization — same policy as dashboard / roster.
 * Avoids averaging every quota window (which made “plans used” misleading).
 */
async function readPlanStatus(input: {
  orgId: string;
  developerId?: string | null;
  now?: Date;
}): Promise<DailyReportPlanStatus | null> {
  const quotaRows = await readQuotas(input.orgId, {
    developerId: input.developerId ?? undefined,
  });
  if (quotaRows.length === 0) return null;

  const allQuotas = dedupeQuotaUtilizations(mapQuotaSnapshots(quotaRows, input.now ?? new Date()));
  const byTool = new Map<string, typeof allQuotas>();
  for (const quota of allQuotas) {
    const key = quota.toolKey || canonicalToolKey(quota.windowType);
    const list = byTool.get(key) ?? [];
    list.push(quota);
    byTool.set(key, list);
  }

  const tools: DailyReportPlanTool[] = [];
  let worstCode: PlanVerdictCode = "UNKNOWN";
  for (const [toolKey, quotas] of byTool) {
    const primaryQuota = selectPrimaryQuota(quotas);
    const verdict = evaluatePlanUtilization({ primaryQuota, included: null });
    if (VERDICT_RANK[verdict.code] > VERDICT_RANK[worstCode]) {
      worstCode = verdict.code;
    }
    const { statusLabel, withinAllowance } = reportPlanStatusLabel(verdict.code);
    const usedPercent = primaryQuota?.rawRatio != null ? primaryQuota.rawRatio * 100 : null;
    tools.push({
      toolName: toolKey,
      displayName: toolDisplayName(toolKey),
      usedPercent,
      statusLabel,
      withinAllowance,
    });
  }

  tools.sort((a, b) => (b.usedPercent ?? -1) - (a.usedPercent ?? -1));

  const withSignal = tools.filter((t) => t.usedPercent != null);
  const usedPercent =
    withSignal.length > 0
      ? withSignal.reduce((sum, t) => sum + (t.usedPercent ?? 0), 0) / withSignal.length
      : null;

  // Fleet badge: every signaled tool within allowance → Within allowance.
  const signaledWithinAllowance = withSignal.map((t) => t.withinAllowance);
  let statusLabel: string;
  let withinAllowance: boolean | null;
  if (signaledWithinAllowance.length > 0 && signaledWithinAllowance.every((v) => v === true)) {
    statusLabel = "Within allowance";
    withinAllowance = true;
  } else {
    ({ statusLabel, withinAllowance } = reportPlanStatusLabel(worstCode));
  }

  return {
    usedPercent,
    statusLabel,
    withinAllowance,
    hint: verdictHint(worstCode),
    tools: tools.slice(0, 4),
  };
}

async function getWeeklyOrgReportPayload(input: {
  orgId: string;
  timeZone: string;
  localDate: string;
}): Promise<DailyReportPayload> {
  const { start, end } = weekRangeEndingOnOrBefore(input.localDate);
  const prevEnd = addLocalDays(start, -1);
  const prevStart = addLocalDays(prevEnd, -6);
  const weekDates = usageDateKeysForLocalDates(localDatesInclusive(start, end));

  const [week, previous, wowStrip, org, plan, acceptancePercent] = await Promise.all([
    readCanonicalReportUsage({
      orgId: input.orgId,
      fromLocalDate: start,
      toLocalDate: end,
    }),
    readCanonicalReportUsage({
      orgId: input.orgId,
      fromLocalDate: prevStart,
      toLocalDate: prevEnd,
    }),
    getWowWeekStrip({
      orgId: input.orgId,
      localDate: end,
      timeZone: input.timeZone,
      weekStart: start,
      weekEnd: end,
      todayPartial: false,
    }),
    prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { name: true },
    }),
    readPlanStatus({ orgId: input.orgId }),
    readAcceptancePercent({ orgId: input.orgId, dates: weekDates }),
  ]);

  const series = wowStripToSeries(wowStrip);

  return {
    kind: "org",
    period: "week",
    localDate: end,
    weekStart: start,
    weekEnd: end,
    timeZone: input.timeZone,
    title: "Team week.",
    subtitle: `${org?.name ?? "Team"} · ${start} – ${end} · ${input.timeZone}`,
    kpis: {
      requests: week.requests,
      tokens: week.tokens,
      cost: week.cost,
      tools: week.tools,
      requestsDeltaPct: pctDelta(week.requests, previous.requests),
      tokensDeltaPct: pctDelta(week.tokens, previous.tokens),
      costDeltaPct: pctDelta(week.cost, previous.cost),
      planUsedPercent: plan?.usedPercent ?? null,
      acceptancePercent,
    },
    plan,
    series,
    wowStrip,
    topTools: week.topTools,
    membersActive: week.activeDevelopers,
  };
}

export async function getDailyReportPayload(input: {
  orgId: string;
  kind: DailyReportKind;
  developerId?: string | null;
  timeZone?: string | null;
  localDate?: string | null;
  now?: Date;
  /** Team/org emails and deep links use week; personal stays day. */
  period?: DailyReportPeriod;
}): Promise<DailyReportPayload> {
  const now = input.now ?? new Date();
  const timeZone = normalizeTimeZone(input.timeZone);
  const localDate = input.localDate?.trim() || localDateString(now, timeZone);

  // Team weekly rollup (Mon–Sun ending on/before localDate).
  if (input.kind === "org" && input.period === "week") {
    return getWeeklyOrgReportPayload({ orgId: input.orgId, timeZone, localDate });
  }

  const previousDate = addLocalDays(localDate, -1);
  const developerId = input.kind === "personal" ? input.developerId ?? null : null;
  const todayDates = usageDateKeysForLocalDates([localDate]);

  const [today, previous, wowStrip, org, plan, acceptancePercent] = await Promise.all([
    readCanonicalReportUsage({
      orgId: input.orgId,
      developerId,
      fromLocalDate: localDate,
      toLocalDate: localDate,
    }),
    readCanonicalReportUsage({
      orgId: input.orgId,
      developerId,
      fromLocalDate: previousDate,
      toLocalDate: previousDate,
    }),
    getWowWeekStrip({
      orgId: input.orgId,
      developerId,
      localDate,
      timeZone,
      todayPartial: true,
    }),
    prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { name: true },
    }),
    readPlanStatus({ orgId: input.orgId, developerId, now }),
    readAcceptancePercent({ orgId: input.orgId, developerId, dates: todayDates }),
  ]);

  // Prefer WOW week strip for chart series — avoids fake hourly dumps from daily totals.
  const series = wowStripToSeries(wowStrip);

  return {
    kind: input.kind,
    period: "day",
    localDate,
    timeZone,
    title: input.kind === "personal" ? "Your day." : "Team day.",
    subtitle:
      input.kind === "personal"
        ? `${localDate} · ${timeZone}`
        : `${org?.name ?? "Team"} · ${localDate} · ${timeZone}`,
    kpis: {
      requests: today.requests,
      tokens: today.tokens,
      cost: today.cost,
      tools: today.tools,
      requestsDeltaPct: pctDelta(today.requests, previous.requests),
      tokensDeltaPct: pctDelta(today.tokens, previous.tokens),
      costDeltaPct: pctDelta(today.cost, previous.cost),
      planUsedPercent: plan?.usedPercent ?? null,
      acceptancePercent,
    },
    plan,
    series,
    wowStrip,
    topTools: today.topTools,
    membersActive: input.kind === "org" ? today.activeDevelopers : undefined,
  };
}
