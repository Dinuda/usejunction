import { prisma } from "@usejunction/db";
import {
  addLocalDays,
  localDateString,
  localDayUtcWindow,
  normalizeTimeZone,
  weekRangeEndingOnOrBefore,
} from "@/lib/timezone";
import { toolDisplayName } from "@/lib/tools/catalog";

export type DailyReportKind = "personal" | "org";
export type DailyReportPeriod = "day" | "week";

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
    /** Avg plan/quota used across assignments (0–100+). Kept for API compat; not shown in report UI. */
    planUsedPercent: number | null;
    /**
     * Accepted / suggested lines from productivity ingest (0–100).
     * Closest proxy we have for “productive effectivity.”
     */
    acceptancePercent: number | null;
  };
  series: DailyReportSeriesPoint[];
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

function sumRows(
  rows: Array<{
    requests: number;
    inputTokens: bigint;
    outputTokens: bigint;
    cacheReadTokens: bigint;
    cacheWriteTokens: bigint;
    costMicros: bigint;
    toolName: string;
  }>,
) {
  let requests = 0;
  let tokens = 0;
  let cost = 0;
  const byTool = new Map<string, DailyReportToolRow>();
  for (const row of rows) {
    const rowTokens =
      Number(row.inputTokens) +
      Number(row.outputTokens) +
      Number(row.cacheReadTokens) +
      Number(row.cacheWriteTokens);
    const rowCost = Number(row.costMicros) / 1_000_000;
    requests += row.requests;
    tokens += rowTokens;
    cost += rowCost;
    const key = row.toolName || "unknown";
    const existing = byTool.get(key) ?? {
      toolName: key,
      displayName: toolDisplayName(key),
      requests: 0,
      tokens: 0,
      cost: 0,
      sharePercent: 0,
      tokenSharePercent: 0,
    };
    existing.requests += row.requests;
    existing.tokens += rowTokens;
    existing.cost += rowCost;
    byTool.set(key, existing);
  }
  const topTools = [...byTool.values()]
    .sort((a, b) => b.tokens - a.tokens || b.cost - a.cost || b.requests - a.requests)
    .slice(0, 6);
  for (const tool of topTools) {
    tool.sharePercent = cost > 0 ? (tool.cost / cost) * 100 : 0;
    tool.tokenSharePercent = tokens > 0 ? (tool.tokens / tokens) * 100 : 0;
  }
  return {
    requests,
    tokens,
    cost,
    tools: byTool.size,
    topTools,
  };
}

async function readPlanUsedPercent(orgId: string, developerId?: string | null): Promise<number | null> {
  const snapshots = await prisma.quotaSnapshot.findMany({
    where: {
      orgId,
      usedPercent: { not: null },
      ...(developerId ? { device: { userId: developerId } } : {}),
    },
    select: { usedPercent: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  const values = snapshots.map((s) => s.usedPercent).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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

async function usageForUtcDates(input: {
  orgId: string;
  developerId?: string | null;
  dates: Date[];
}) {
  if (input.dates.length === 0) return [];
  return prisma.usageDaily.findMany({
    where: {
      orgId: input.orgId,
      date: { in: input.dates },
      metricKind: "usage",
      ...(input.developerId ? { developerId: input.developerId } : {}),
    },
    select: {
      requests: true,
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      costMicros: true,
      toolName: true,
      date: true,
    },
  });
}

async function hourlySeries(input: {
  orgId: string;
  developerId?: string | null;
  from: Date;
  to: Date;
  timeZone: string;
}): Promise<DailyReportSeriesPoint[]> {
  const rows = await prisma.requestMetadata.findMany({
    where: {
      orgId: input.orgId,
      createdAt: { gte: input.from, lt: input.to },
      ...(input.developerId ? { userId: input.developerId } : {}),
    },
    select: {
      createdAt: true,
      totalTokens: true,
      estimatedCost: true,
    },
  });

  const buckets = new Map<number, DailyReportSeriesPoint>();
  for (let h = 0; h < 24; h++) {
    buckets.set(h, { label: `${String(h).padStart(2, "0")}:00`, requests: 0, tokens: 0, cost: 0 });
  }
  for (const row of rows) {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: input.timeZone,
        hour: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(row.createdAt)
        .find((p) => p.type === "hour")?.value ?? "0",
    );
    const bucket = buckets.get(hour);
    if (!bucket) continue;
    bucket.requests += 1;
    bucket.tokens += row.totalTokens;
    bucket.cost += row.estimatedCost;
  }

  const points = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
  // Drop trailing empty hours after last activity for a cleaner chart.
  let lastActive = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].requests > 0 || points[i].tokens > 0) {
      lastActive = i;
      break;
    }
  }
  if (lastActive < 0) {
    const endHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: input.timeZone,
        hour: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "hour")?.value ?? "23",
    );
    return points.slice(0, Math.max(1, endHour + 1));
  }
  return points.slice(0, lastActive + 1);
}

function dailySeriesForDay(input: {
  hourly: DailyReportSeriesPoint[];
  totals: { requests: number; tokens: number; cost: number };
  timeZone: string;
  now: Date;
}): DailyReportSeriesPoint[] {
  if (input.hourly.some((p) => p.requests > 0 || p.tokens > 0 || p.cost > 0)) {
    return input.hourly;
  }
  if (input.totals.requests <= 0 && input.totals.cost <= 0 && input.totals.tokens <= 0) {
    return input.hourly;
  }

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(input.now)
      .find((p) => p.type === "hour")?.value ?? "0",
  );
  const points: DailyReportSeriesPoint[] = [];
  for (let h = 0; h <= hour; h++) {
    points.push({
      label: `${String(h).padStart(2, "0")}:00`,
      requests: 0,
      tokens: 0,
      cost: 0,
    });
  }
  const peak = points[points.length - 1]!;
  peak.requests = input.totals.requests;
  peak.tokens = input.totals.tokens;
  peak.cost = input.totals.cost;
  return points;
}

async function recentDailySeries(input: {
  orgId: string;
  developerId?: string | null;
  localDate: string;
  days?: number;
}): Promise<DailyReportSeriesPoint[]> {
  const days = input.days ?? 7;
  const dates: Date[] = [];
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addLocalDays(input.localDate, -i);
    labels.push(day.slice(5));
    dates.push(dateOnlyUtc(new Date(`${day}T00:00:00.000Z`)));
  }
  const rows = await usageForUtcDates({
    orgId: input.orgId,
    developerId: input.developerId,
    dates,
  });
  const byDate = new Map<string, DailyReportSeriesPoint>();
  for (const label of labels) {
    byDate.set(label, { label, requests: 0, tokens: 0, cost: 0 });
  }
  for (const row of rows) {
    const label = row.date.toISOString().slice(5, 10);
    const point = byDate.get(label);
    if (!point) continue;
    point.requests += row.requests;
    point.tokens +=
      Number(row.inputTokens) +
      Number(row.outputTokens) +
      Number(row.cacheReadTokens) +
      Number(row.cacheWriteTokens);
    point.cost += Number(row.costMicros) / 1_000_000;
  }
  return labels.map((label) => byDate.get(label)!);
}

async function getWeeklyOrgReportPayload(input: {
  orgId: string;
  timeZone: string;
  localDate: string;
}): Promise<DailyReportPayload> {
  const { start, end } = weekRangeEndingOnOrBefore(input.localDate);
  const prevEnd = addLocalDays(start, -1);
  const prevStart = addLocalDays(prevEnd, -6);
  const weekDates = localDatesInclusive(start, end).map((d) => dateOnlyUtc(new Date(`${d}T00:00:00.000Z`)));
  const prevDates = localDatesInclusive(prevStart, prevEnd).map((d) =>
    dateOnlyUtc(new Date(`${d}T00:00:00.000Z`)),
  );

  const [weekRows, prevRows, series, org, active, planUsedPercent, acceptancePercent] = await Promise.all([
    usageForUtcDates({ orgId: input.orgId, dates: weekDates }),
    usageForUtcDates({ orgId: input.orgId, dates: prevDates }),
    recentDailySeries({
      orgId: input.orgId,
      localDate: end,
      days: 7,
    }),
    prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { name: true },
    }),
    prisma.usageDaily.findMany({
      where: {
        orgId: input.orgId,
        date: { in: weekDates },
        metricKind: "usage",
        developerId: { not: null },
      },
      select: { developerId: true },
      distinct: ["developerId"],
    }),
    readPlanUsedPercent(input.orgId),
    readAcceptancePercent({ orgId: input.orgId, dates: weekDates }),
  ]);

  const week = sumRows(weekRows);
  const previous = sumRows(prevRows);

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
      planUsedPercent,
      acceptancePercent,
    },
    series,
    topTools: week.topTools,
    membersActive: active.length,
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

  const window = localDayUtcWindow({ localDate, timeZone, now, throughNow: true });
  const previousDate = addLocalDays(localDate, -1);

  const developerId = input.kind === "personal" ? input.developerId ?? null : null;
  const todayDates = [
    dateOnlyUtc(new Date(`${localDate}T00:00:00.000Z`)),
    // Include adjacent UTC dates that the local day may spill into.
    dateOnlyUtc(window.from),
    dateOnlyUtc(new Date(window.to.getTime() - 1)),
  ];
  const uniqueToday = [...new Map(todayDates.map((d) => [d.toISOString(), d])).values()];
  const prevDates = [dateOnlyUtc(new Date(`${previousDate}T00:00:00.000Z`))];

  const [todayRows, prevRows, hourly, org, planUsedPercent, acceptancePercent] = await Promise.all([
    usageForUtcDates({ orgId: input.orgId, developerId, dates: uniqueToday }),
    usageForUtcDates({ orgId: input.orgId, developerId, dates: prevDates }),
    hourlySeries({
      orgId: input.orgId,
      developerId: developerId ?? undefined,
      from: window.from,
      to: window.to,
      timeZone,
    }),
    prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { name: true },
    }),
    readPlanUsedPercent(input.orgId, developerId),
    readAcceptancePercent({ orgId: input.orgId, developerId, dates: uniqueToday }),
  ]);

  // Prefer exact localDate UTC key rows when present; else all overlapping.
  const exact = todayRows.filter((r) => r.date.toISOString().slice(0, 10) === localDate);
  const today = sumRows(exact.length > 0 ? exact : todayRows);
  const previous = sumRows(prevRows);

  const series = dailySeriesForDay({
    hourly,
    totals: { requests: today.requests, tokens: today.tokens, cost: today.cost },
    timeZone,
    now,
  });

  let membersActive: number | undefined;
  if (input.kind === "org") {
    const active = await prisma.usageDaily.findMany({
      where: {
        orgId: input.orgId,
        date: { in: uniqueToday },
        metricKind: "usage",
        developerId: { not: null },
      },
      select: { developerId: true },
      distinct: ["developerId"],
    });
    membersActive = active.length;
  }

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
      planUsedPercent,
      acceptancePercent,
    },
    series,
    topTools: today.topTools,
    membersActive,
  };
}
