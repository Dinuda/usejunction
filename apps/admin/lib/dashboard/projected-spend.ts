import type { OrgOverviewV1 } from "@/lib/insights";
import { canonicalToolKey } from "@/lib/tools/catalog";

export type ProjectedSpendPoint = {
  date: string;
  actual: number | null;
  projected: number | null;
  commitment: number;
};

export type ProjectedSpendSeries = {
  points: ProjectedSpendPoint[];
  actualSpend: number;
  projectedSpend: number;
  commitment: number;
  /** Positive when projected is above commitment. */
  vsCommitment: number;
  todayIndex: number;
  complete: boolean;
};

export type SpendLens = "commitment" | "usage";

export type CycleUsageNeedRow = {
  id: string;
  toolKey: string;
  toolName: string;
  /** Seat commitment for this tool line. */
  cycleSpend: number;
  /** Usage cost in the report window. */
  usageCost: number;
  /** Share of total seat commitment (0–100). */
  commitmentSharePercent: number;
  /** Current plan/allowance use (0–100+). */
  usedPercent: number | null;
  /** Display-capped used % for bars (0–100). */
  usedDisplayPercent: number | null;
  /** Expected % used by now if burn were linear with the cycle. */
  needSoFarPercent: number | null;
  /** Extrapolated % used by cycle end at current pace. */
  projectedPercent: number | null;
  projectedDisplayPercent: number | null;
  projectionState: "forming" | "reliable" | "unavailable";
  verdictCode: OrgOverviewV1["subscriptionCycles"][number]["verdictCode"];
};

/** One tool’s own billing cycle as a coverage runway (not a shared axis). */
export type CycleCoverageRunway = {
  seriesKey: string;
  toolKey: string;
  label: string;
  cycleStart: string;
  cycleEnd: string;
  nextRenewalDate: string;
  totalDays: number;
  remainingDays: number;
  /** Today’s position in this tool’s cycle (0–100). */
  todayProgress: number;
  usedPercent: number;
  needPercent: number;
  paceGap: number;
  projectedPercent: number | null;
  /**
   * How far into this cycle the plan allowance lasts (0–100).
   * null when pace is still forming / unknown.
   */
  coverageProgress: number | null;
  coversFullCycle: boolean;
  /** Date coverage lasts through (exhaust or cycle end). */
  coversThroughDate: string | null;
  coverageState: "forming" | "covers_full" | "runs_out" | "exceeded" | "unavailable";
  projectionState: "forming" | "reliable" | "unavailable";
  verdictCode: OrgOverviewV1["subscriptionCycles"][number]["verdictCode"];
  /** Seat billing cadence (monthly / weekly / …). */
  billingCadence: string | null;
};

export type CycleCoverageRunways = {
  rows: CycleCoverageRunway[];
  /** Count of selected tools that cover their full cycle. */
  coversFullCount: number;
  /** Earliest run-out date among tools that don’t cover full (ISO date). */
  earliestRunOutDate: string | null;
  /** Shared calendar domain across selected cycles (ms UTC midnight). */
  calendar: {
    rangeStartMs: number;
    rangeEndMs: number;
    todayMs: number;
    /** Nice tick dates (ISO) inside the domain. */
    tickDates: string[];
  };
};

function isoTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function seriesKeyForTool(toolKey: string, index: number) {
  const safe = canonicalToolKey(toolKey).replace(/[^a-z0-9]+/gi, "_") || `tool_${index}`;
  return `t_${safe}`;
}

/**
 * Cumulative usage spend with a linear projection for remaining days in the view.
 * Commitment (subscription seats) is kept for reference — not mixed into the usage total.
 */
export function buildProjectedSpendSeries(
  trend: OrgOverviewV1["trend"],
  commitment: number,
  options: { today?: string } = {},
): ProjectedSpendSeries {
  const today = options.today ?? isoTodayUtc();
  if (!trend.length) {
    return {
      points: [],
      actualSpend: 0,
      projectedSpend: 0,
      commitment,
      vsCommitment: 0 - commitment,
      todayIndex: -1,
      complete: true,
    };
  }

  let todayIndex = trend.findIndex((point) => point.date >= today);
  if (todayIndex < 0) todayIndex = trend.length - 1;
  if (trend[0] && trend[0].date > today) todayIndex = 0;

  const lastTrendDate = trend[trend.length - 1]?.date ?? today;
  const complete = lastTrendDate < today;

  const cumulatives: number[] = [];
  let running = 0;
  for (const point of trend) {
    running += point.cost;
    cumulatives.push(running);
  }

  const elapsedDays = complete ? trend.length : Math.max(1, todayIndex + 1);
  const actualSpend = complete
    ? (cumulatives[cumulatives.length - 1] ?? 0)
    : (cumulatives[todayIndex] ?? 0);
  const dailyAvg = actualSpend / elapsedDays;
  const remainingDays = complete ? 0 : Math.max(0, trend.length - elapsedDays);
  const projectedSpend = actualSpend + dailyAvg * remainingDays;

  const points: ProjectedSpendPoint[] = trend.map((point, index) => {
    const actual = complete || index <= todayIndex ? cumulatives[index]! : null;
    let projected: number | null = null;
    if (!complete && index >= todayIndex) {
      projected = actualSpend + dailyAvg * (index - todayIndex);
    }
    // Linear commitment pace across the window (0 → full seats by period end).
    const commitmentPace =
      trend.length <= 1 ? commitment : (commitment * index) / (trend.length - 1);
    return {
      date: point.date,
      actual,
      projected,
      commitment: commitmentPace,
    };
  });

  return {
    points,
    actualSpend,
    projectedSpend: complete ? actualSpend : projectedSpend,
    commitment,
    vsCommitment: (complete ? actualSpend : projectedSpend) - commitment,
    todayIndex,
    complete,
  };
}

/**
 * Extrapolate end-of-cycle utilization from current use and how far through the cycle we are.
 * Returns null while the window is still forming (<5% elapsed) or when use is unknown.
 */
export function projectCycleUtilization(
  usedPercent: number | null,
  elapsedPercent: number | null,
): number | null {
  if (usedPercent == null || elapsedPercent == null) return null;
  if (elapsedPercent < 5) return null;
  return usedPercent / (elapsedPercent / 100);
}

/** Build per-tool commitment + cycle usage/need rows for the spend hero. */
export function buildCycleUsageNeedRows(
  cycles: OrgOverviewV1["subscriptionCycles"],
): CycleUsageNeedRow[] {
  const totalCommitment = cycles.reduce((sum, row) => sum + Math.max(0, row.cycleSpend), 0);

  return cycles.map((row) => {
    const elapsed = row.billingCycle.elapsedPercent;
    const projected =
      row.projectionState === "unavailable"
        ? null
        : projectCycleUtilization(row.utilizationPercent, elapsed);
    const needSoFar = Number.isFinite(elapsed) ? Math.min(100, Math.max(0, elapsed)) : null;

    return {
      id: row.id,
      toolKey: row.toolKey ?? row.toolName,
      toolName: row.toolName,
      cycleSpend: row.cycleSpend,
      usageCost: row.verifiedUsageCost + row.estimatedApiCost,
      commitmentSharePercent:
        totalCommitment > 0 ? (Math.max(0, row.cycleSpend) / totalCommitment) * 100 : 0,
      usedPercent: row.utilizationPercent,
      usedDisplayPercent: row.utilizationDisplayPercent,
      needSoFarPercent: needSoFar,
      projectedPercent: projected,
      projectedDisplayPercent:
        projected == null ? null : Math.min(100, Math.max(0, projected)),
      projectionState: row.projectionState,
      verdictCode: row.verdictCode,
    };
  });
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Map a 0–100 progress point onto this cycle’s calendar. */
export function dateAtCycleProgress(
  cycleStart: string,
  cycleEnd: string,
  totalDays: number,
  progress: number,
): string {
  const clamped = Math.min(100, Math.max(0, progress));
  if (clamped >= 100) return cycleEnd;
  if (clamped <= 0) return cycleStart;
  const span = Math.max(0, totalDays - 1);
  return addDaysIso(cycleStart, Math.round((span * clamped) / 100));
}

/** Progress of an ISO date within a cycle window (0–100). */
export function progressAtCycleDate(cycleStart: string, cycleEnd: string, isoDate: string): number {
  const start = Date.parse(`${cycleStart}T00:00:00.000Z`);
  const end = Date.parse(`${cycleEnd}T00:00:00.000Z`);
  const raw = isoDate.includes("T") ? isoDate : `${isoDate}T00:00:00.000Z`;
  const at = Date.parse(raw);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(at) || end <= start) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));
}

function utcMidnightMs(isoDate: string): number {
  const raw = isoDate.includes("T") ? isoDate.slice(0, 10) : isoDate;
  return Date.parse(`${raw}T00:00:00.000Z`);
}

function buildCalendarTicks(rangeStartMs: number, rangeEndMs: number): string[] {
  const spanDays = Math.max(1, Math.round((rangeEndMs - rangeStartMs) / 86_400_000));
  const stepDays = spanDays <= 20 ? 5 : spanDays <= 45 ? 7 : 14;
  const ticks: string[] = [new Date(rangeStartMs).toISOString().slice(0, 10)];
  for (let cursor = rangeStartMs + stepDays * 86_400_000; cursor < rangeEndMs; cursor += stepDays * 86_400_000) {
    ticks.push(new Date(cursor).toISOString().slice(0, 10));
  }
  const endIso = new Date(rangeEndMs).toISOString().slice(0, 10);
  if (ticks[ticks.length - 1] !== endIso) ticks.push(endIso);
  return ticks;
}

/**
 * Per-tool coverage runway on each tool’s billed seat cycle.
 * Run-out dates match Current cycles: `expectedEndAt` from quota pace + verdict
 * (not a linear used÷billing-elapsed guess).
 */
export function buildCycleCoverageRunways(
  cycles: OrgOverviewV1["subscriptionCycles"],
  options: { labelForTool?: (toolKey: string) => string; today?: string } = {},
): CycleCoverageRunways {
  const todayIso = options.today ?? isoTodayUtc();
  const todayMs = utcMidnightMs(todayIso);

  const rows: CycleCoverageRunway[] = cycles
    .filter(
      (row) => row.utilizationPercent != null && Number.isFinite(row.billingCycle.elapsedPercent),
    )
    .map((row, index) => {
      const toolKey = row.toolKey ?? row.toolName;
      const { cycleStart, cycleEnd, nextRenewalDate, totalDays, remainingDays, elapsedPercent } =
        row.billingCycle;
      const todayProgress = Math.min(100, Math.max(0, elapsedPercent));
      const used = Math.max(0, row.utilizationPercent ?? 0);
      const expectedEndAt = row.expectedEndAt?.slice(0, 10) ?? null;
      const verdict = row.verdictCode;

      let coverageProgress: number | null = null;
      let coversFullCycle = false;
      let coversThroughDate: string | null = null;
      let coverageState: CycleCoverageRunway["coverageState"] = "unavailable";

      if (verdict === "LIMIT_EXCEEDED" || used >= 100) {
        coverageState = "exceeded";
        coversThroughDate = expectedEndAt ?? todayIso;
        coverageProgress = progressAtCycleDate(cycleStart, cycleEnd, coversThroughDate);
      } else if (verdict === "NEAR_LIMIT" && expectedEndAt) {
        coverageState = "runs_out";
        coversThroughDate = expectedEndAt;
        coverageProgress = progressAtCycleDate(cycleStart, cycleEnd, expectedEndAt);
        coversFullCycle = coverageProgress >= 99.5;
        if (coversFullCycle) coverageState = "covers_full";
      } else if (row.projectionState === "forming") {
        coverageState = "forming";
      } else if (
        verdict === "HEALTHY" ||
        verdict === "LIGHT_USE" ||
        (verdict === "NEAR_LIMIT" && !expectedEndAt)
      ) {
        // Same as Current cycles: within allowance / on track → lasts through billed cycle.
        coverageState = "covers_full";
        coversFullCycle = true;
        coverageProgress = 100;
        coversThroughDate = cycleEnd;
      } else if (row.projectionState === "reliable" && expectedEndAt) {
        coverageState = "runs_out";
        coversThroughDate = expectedEndAt;
        coverageProgress = progressAtCycleDate(cycleStart, cycleEnd, expectedEndAt);
      } else {
        coverageState = "unavailable";
      }

      return {
        seriesKey: seriesKeyForTool(toolKey, index),
        toolKey,
        label: options.labelForTool?.(toolKey) ?? toolKey,
        cycleStart,
        cycleEnd,
        nextRenewalDate,
        totalDays,
        remainingDays,
        todayProgress,
        usedPercent: used,
        needPercent: todayProgress,
        paceGap: used - todayProgress,
        projectedPercent: null,
        coverageProgress,
        coversFullCycle,
        coversThroughDate,
        coverageState,
        projectionState: row.projectionState,
        verdictCode: row.verdictCode,
        billingCadence: row.billingCadence ?? null,
      };
    });

  const runOutDates = rows
    .filter(
      (row) =>
        (row.coverageState === "runs_out" || row.coverageState === "exceeded") &&
        row.coversThroughDate,
    )
    .map((row) => row.coversThroughDate!)
    .sort();

  const startMs = rows.map((row) => utcMidnightMs(row.cycleStart));
  const endMs = rows.map((row) => utcMidnightMs(row.cycleEnd));
  const rangeStartMs = startMs.length ? Math.min(...startMs) : todayMs;
  const rangeEndMs = endMs.length ? Math.max(...endMs) : todayMs + 30 * 86_400_000;

  return {
    rows,
    coversFullCount: rows.filter((row) => row.coversFullCycle).length,
    earliestRunOutDate: runOutDates[0] ?? null,
    calendar: {
      rangeStartMs,
      rangeEndMs: Math.max(rangeEndMs, rangeStartMs + 86_400_000),
      todayMs,
      tickDates: buildCalendarTicks(rangeStartMs, Math.max(rangeEndMs, rangeStartMs + 86_400_000)),
    },
  };
}

