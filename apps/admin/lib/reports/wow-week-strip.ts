import { addLocalDays, weekdayOfLocalDate } from "@/lib/timezone";
import {
  readCanonicalReportUsage,
  sliceDayTotals,
} from "@/lib/reports/canonical-usage";

export type RhythmMetric = "tokens" | "cost" | "requests";

export type WowWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Mon=0 … Sun=6

export type WowWeekdayCell = {
  localDate: string;
  weekday: WowWeekday;
  label: string;
  tokens: number;
  cost: number;
  requests: number;
  priorTokens: number;
  priorCost: number;
  priorRequests: number;
  /** null when both current and prior are zero */
  deltaPct: number | null;
  isOutlier: boolean;
  isToday: boolean;
  /** Future day in the week, or today still in progress. */
  isPartial: boolean;
};

export type WowWeekInsight = {
  headline: string;
  peakWeekday: WowWeekday | null;
  peakSharePct: number | null;
  weekDeltaPct: number | null;
};

export type WowWeekStripV1 = {
  version: 1;
  grain: "day";
  metricDefault: RhythmMetric;
  timeZone: string;
  weekStart: string;
  weekEnd: string;
  /** @deprecated Prior calendar day before weekStart — kept for API compat. */
  priorWeekStart: string;
  /** @deprecated Same as priorWeekStart — strip compares each day to the prior calendar day. */
  priorWeekEnd: string;
  cells: WowWeekdayCell[];
  insight: WowWeekInsight;
  availability: "complete" | "partial";
};

export const WOW_OUTLIER_DELTA_PCT = 25;

/**
 * Ignore WOW % when the prior day is a near-empty baseline.
 * Otherwise Sat/Sun explode to +20000% after a quiet prior weekend.
 */
export const WOW_MIN_PRIOR_SHARE = 0.05;

export const WOW_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type WowDayTotals = {
  tokens: number;
  cost: number;
  requests: number;
};

const EMPTY: WowDayTotals = { tokens: 0, cost: 0, requests: 0 };

/** Mon–Sun week that contains `localDate`. */
export function weekRangeContaining(localDate: string): { start: string; end: string } {
  const dow = weekdayOfLocalDate(localDate); // Sun=0 … Sat=6
  const daysSinceMon = dow === 0 ? 6 : dow - 1;
  const start = addLocalDays(localDate, -daysSinceMon);
  return { start, end: addLocalDays(start, 6) };
}

export function isoWeekdayOfLocalDate(localDate: string): WowWeekday {
  const dow = weekdayOfLocalDate(localDate);
  return (dow === 0 ? 6 : dow - 1) as WowWeekday;
}

export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/** Delta safe to show on the strip — null when prior baseline is noise or missing. */
export function displayWowDeltaPct(prior: number, current: number): number | null {
  if (prior <= 0 && current <= 0) return null;
  if (prior <= 0) return null;
  if (
    current > 0 &&
    Math.min(prior, current) / Math.max(prior, current) < WOW_MIN_PRIOR_SHARE
  ) {
    return null;
  }
  return pctDelta(prior, current);
}

export function metricOf(totals: WowDayTotals, metric: RhythmMetric): number {
  if (metric === "tokens") return totals.tokens;
  if (metric === "cost") return totals.cost;
  return totals.requests;
}

function preferMetric(cells: WowWeekdayCell[]): RhythmMetric {
  if (cells.some((c) => c.tokens > 0 || c.priorTokens > 0)) return "tokens";
  if (cells.some((c) => c.cost > 0 || c.priorCost > 0)) return "cost";
  return "requests";
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

export function buildWowWeekInsight(input: {
  cells: WowWeekdayCell[];
  metric: RhythmMetric;
  topToolDisplayName?: string | null;
}): WowWeekInsight {
  const { cells, metric, topToolDisplayName } = input;
  let weekCurrent = 0;
  let peakWeekday: WowWeekday | null = null;
  let peakValue = 0;

  for (const cell of cells) {
    const current = metricOf(cell, metric);
    weekCurrent += current;
    if (current > peakValue) {
      peakValue = current;
      peakWeekday = cell.weekday;
    }
  }

  const todayCell = cells.find((c) => c.isToday);
  const todayDeltaPct = todayCell?.deltaPct ?? null;
  const peakSharePct =
    weekCurrent > 0 && peakValue > 0 ? (peakValue / weekCurrent) * 100 : null;

  const parts: string[] = [];
  if (todayDeltaPct != null) {
    const unit = metric === "cost" ? "spend" : metric;
    parts.push(`${formatSignedPct(todayDeltaPct)} ${unit} vs yesterday`);
  }
  if (peakWeekday != null && peakValue > 0) {
    parts.push(`Peak: ${WOW_WEEKDAY_LABELS[peakWeekday]}`);
  }
  if (topToolDisplayName) {
    parts.push(`mostly ${topToolDisplayName}`);
  }
  if (parts.length === 0) {
    parts.push("No usage this week yet");
  }

  return {
    headline: parts.join(" · "),
    peakWeekday,
    peakSharePct,
    weekDeltaPct: todayDeltaPct,
  };
}

/**
 * Pure builder: 7 Mon→Sun cells with day-over-day deltas from day totals maps.
 * Days after `asOfLocalDate` are zeroed and marked partial (future).
 */
export function buildWowWeekStrip(input: {
  asOfLocalDate: string;
  timeZone: string;
  weekStart: string;
  weekEnd: string;
  currentByDate: Map<string, WowDayTotals>;
  priorByDate: Map<string, WowDayTotals>;
  topToolDisplayName?: string | null;
  /** When true, `asOfLocalDate` is still in progress (daily personal report). */
  todayPartial?: boolean;
  /** Optional send-time baseline for today's prior day (yesterday at report hour). */
  todayPriorOverride?: WowDayTotals | null;
}): WowWeekStripV1 {
  const dayBeforeWeek = addLocalDays(input.weekStart, -1);
  const cells: WowWeekdayCell[] = [];

  for (let i = 0; i < 7; i++) {
    const localDate = addLocalDays(input.weekStart, i);
    const priorDate = addLocalDays(localDate, -1);
    const weekday = i as WowWeekday;
    const isFuture = localDate > input.asOfLocalDate;
    const isToday = localDate === input.asOfLocalDate;
    const current = isFuture ? EMPTY : (input.currentByDate.get(localDate) ?? EMPTY);
    const prior =
      isToday && input.todayPriorOverride
        ? input.todayPriorOverride
        : (input.priorByDate.get(priorDate) ?? EMPTY);
    const deltaMetric: RhythmMetric =
      current.tokens > 0 || prior.tokens > 0
        ? "tokens"
        : current.cost > 0 || prior.cost > 0
          ? "cost"
          : "requests";
    const currentMetric = metricOf(current, deltaMetric);
    const priorMetric = metricOf(prior, deltaMetric);
    const deltaPct = isFuture ? null : displayWowDeltaPct(priorMetric, currentMetric);
    const isOutlier =
      !isFuture &&
      deltaPct != null &&
      priorMetric > 0 &&
      Math.abs(deltaPct) >= WOW_OUTLIER_DELTA_PCT;

    cells.push({
      localDate,
      weekday,
      label: WOW_WEEKDAY_LABELS[weekday],
      tokens: current.tokens,
      cost: current.cost,
      requests: current.requests,
      priorTokens: prior.tokens,
      priorCost: prior.cost,
      priorRequests: prior.requests,
      deltaPct: isFuture ? null : deltaPct,
      isOutlier,
      isToday,
      isPartial: isFuture || (isToday && input.todayPartial === true),
    });
  }

  const metricDefault = preferMetric(cells);
  const priorDaysWithData = cells.filter(
    (c) => c.priorTokens > 0 || c.priorCost > 0 || c.priorRequests > 0,
  ).length;
  const currentHasData = cells.some((c) => c.tokens > 0 || c.cost > 0 || c.requests > 0);
  const availability: "complete" | "partial" =
    priorDaysWithData === 7 || (!currentHasData && priorDaysWithData === 0)
      ? "complete"
      : "partial";

  return {
    version: 1,
    grain: "day",
    metricDefault,
    timeZone: input.timeZone,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    priorWeekStart: dayBeforeWeek,
    priorWeekEnd: dayBeforeWeek,
    cells,
    insight: buildWowWeekInsight({
      cells,
      metric: metricDefault,
      topToolDisplayName: input.topToolDisplayName,
    }),
    availability,
  };
}

function localDatesInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return dates;
}

function fillMissingDays(
  localDates: string[],
  byDay: Map<string, WowDayTotals>,
): Map<string, WowDayTotals> {
  const out = new Map<string, WowDayTotals>();
  for (const d of localDates) {
    out.set(d, byDay.get(d) ? { ...byDay.get(d)! } : { ...EMPTY });
  }
  return out;
}

/** Load Mon–Sun strip ending on/containing `localDate` (day-over-day deltas). */
export async function getWowWeekStrip(input: {
  orgId: string;
  developerId?: string | null;
  localDate: string;
  timeZone: string;
  /** Explicit Mon–Sun bounds (team weekly). Defaults to week containing localDate. */
  weekStart?: string;
  weekEnd?: string;
  /** Mark today as partial (personal mid-day / evening report). */
  todayPartial?: boolean;
  /** Send-time baseline for yesterday when comparing today's cell. */
  todayPriorOverride?: WowDayTotals | null;
}): Promise<WowWeekStripV1> {
  const range =
    input.weekStart && input.weekEnd
      ? { start: input.weekStart, end: input.weekEnd }
      : weekRangeContaining(input.localDate);
  const dayBeforeWeek = addLocalDays(range.start, -1);
  const currentDates = localDatesInclusive(range.start, range.end);
  const spanDates = localDatesInclusive(dayBeforeWeek, range.end);

  const asOfEnd = input.localDate < range.end ? input.localDate : range.end;
  const [spanUsage, currentWeekUsage] = await Promise.all([
    readCanonicalReportUsage({
      orgId: input.orgId,
      developerId: input.developerId,
      fromLocalDate: dayBeforeWeek,
      toLocalDate: range.end,
    }),
    readCanonicalReportUsage({
      orgId: input.orgId,
      developerId: input.developerId,
      fromLocalDate: range.start,
      toLocalDate: asOfEnd,
    }),
  ]);

  const spanByDate = fillMissingDays(
    spanDates,
    sliceDayTotals(spanUsage.byDay, dayBeforeWeek, range.end),
  );
  const currentByDate = fillMissingDays(
    currentDates,
    sliceDayTotals(spanUsage.byDay, range.start, range.end),
  );

  return buildWowWeekStrip({
    asOfLocalDate: input.localDate,
    timeZone: input.timeZone,
    weekStart: range.start,
    weekEnd: range.end,
    currentByDate,
    priorByDate: spanByDate,
    topToolDisplayName: currentWeekUsage.topTools[0]?.displayName ?? null,
    todayPartial: input.todayPartial,
    todayPriorOverride: input.todayPriorOverride,
  });
}

/** Series points for legacy chart consumers — one point per weekday in the strip. */
export function wowStripToSeries(strip: WowWeekStripV1) {
  return strip.cells.map((cell) => ({
    label: cell.label,
    requests: cell.requests,
    tokens: cell.tokens,
    cost: cell.cost,
  }));
}
