import { quotaWindowLabel } from "@/lib/quotas/display";
import {
  PLAN_UTILIZATION_POLICY_VERSION,
  dedupeQuotaUtilizations,
  evaluatePlanUtilization,
  mapQuotaSnapshots,
  selectPrimaryQuota,
  type IncludedAllowanceUtilization,
  type PlanVerdict,
  type PlanVerdictCode,
  type QuotaSnapshotInput,
  type QuotaHistorySample,
  type QuotaUtilization,
} from "@/lib/quotas/plan-utilization-policy";
import { toolDisplayName } from "@/lib/tools/catalog";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_HISTORY_SPAN_MS = 30 * 60 * 1000;

export type PaceCycleWindow = {
  startsAt: string;
  endsAt: string;
};

/** Pace vs the quota window: will they exhaust before reset? */
export type QuotaPaceCode =
  | "EXCESS"
  | "ON_TRACK"
  | "UNDER"
  | "STABLE"
  | "ALREADY_EXCEEDED"
  | "FORMING"
  | "UNKNOWN";

export type QuotaPace = {
  code: QuotaPaceCode;
  toolKey: string;
  toolLabel: string;
  windowType: string;
  windowLabel: string;
  usedPercent: number | null;
  /** Expected % used if burn were linear across the window so far. */
  expectedPercent: number | null;
  /** Days until 100% at current burn rate. Null when unknown or already empty. */
  daysToExhaust: number | null;
  /** Days until the vendor reset. */
  daysToReset: number | null;
  exhaustAt: string | null;
  resetsAt: string | null;
  /** One-line manager summary. */
  summary: string;
  projectionState: "forming" | "reliable" | "unavailable";
};

/** Infer billing-window length when providers omit periodStartsAt. */
export function inferQuotaWindowMs(windowType: string): number | null {
  if (/session_5h|5[-_]?h/i.test(windowType)) return 5 * HOUR_MS;
  if (/week|seven_day/i.test(windowType)) return 7 * DAY_MS;
  if (/day|daily/i.test(windowType)) return DAY_MS;
  if (/month|^plan$|^api$|^auto$|^copilot_/i.test(windowType)) return 30 * DAY_MS;
  if (/year|annual/i.test(windowType)) return 365 * DAY_MS;
  return null;
}

function formatDuration(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 1.5) return "about a day";
  return `${Math.round(days)} days`;
}

function ratioToPercent(ratio: number): number {
  return Math.round(ratio * 10_000) / 100;
}

type HistoryBurn = {
  burnPerMs: number;
  spanMs: number;
  deltaRatio: number;
};

function historyBurn(samples: QuotaHistorySample[]): HistoryBurn | null {
  const history = [...samples].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
  let first = history[0];
  const last = history[history.length - 1];
  for (let index = 1; index < history.length; index += 1) {
    if (history[index]!.usedPercent < history[index - 1]!.usedPercent) first = history[index];
  }
  const spanMs = first && last
    ? new Date(last.observedAt).getTime() - new Date(first.observedAt).getTime()
    : 0;
  if (!first || !last || history.length < 2 || spanMs < MIN_HISTORY_SPAN_MS) return null;
  const deltaRatio = last.usedPercent / 100 - first.usedPercent / 100;
  if (deltaRatio <= 0) return { burnPerMs: 0, spanMs, deltaRatio };
  return { burnPerMs: deltaRatio / spanMs, spanMs, deltaRatio };
}

function priorCycleBurn(
  samples: QuotaHistorySample[],
  currentResetAt: string,
): HistoryBurn | null {
  const byCycle = new Map<string, QuotaHistorySample[]>();
  for (const sample of samples) {
    const list = byCycle.get(sample.resetAt) ?? [];
    list.push(sample);
    byCycle.set(sample.resetAt, list);
  }
  const priorCycles = [...byCycle.entries()]
    .filter(([resetAt]) => resetAt !== currentResetAt)
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  for (const [, cycleSamples] of priorCycles) {
    const burn = historyBurn(cycleSamples);
    if (burn) return burn;
  }
  return null;
}

function projectFromBurnRate(input: {
  base: Omit<QuotaPace, "code" | "summary" | "projectionState"> & {
    toolLabel: string;
    windowLabel: string;
  };
  burnPerMs: number;
  usedRatio: number;
  expectedRatio: number;
  expectedPercent: number;
  usedPercent: number;
  daysToReset: number;
  remainingMs: number;
  nowMs: number;
  stableSummary: string;
}): QuotaPace {
  const {
    base,
    burnPerMs,
    usedRatio,
    expectedRatio,
    expectedPercent,
    usedPercent,
    daysToReset,
    remainingMs,
    nowMs,
    stableSummary,
  } = input;
  if (burnPerMs <= 0) {
    return {
      ...base,
      code: "STABLE",
      expectedPercent,
      usedPercent,
      daysToReset,
      summary: stableSummary,
      projectionState: "reliable",
    };
  }
  const historyMsToExhaust = (1 - usedRatio) / burnPerMs;
  const historyDaysToExhaust = Number.isFinite(historyMsToExhaust) ? historyMsToExhaust / DAY_MS : null;
  const historyExhaustAt = historyDaysToExhaust != null
    ? new Date(nowMs + historyMsToExhaust).toISOString()
    : null;
  let code: QuotaPaceCode;
  if (historyMsToExhaust < remainingMs) {
    code = "EXCESS";
  } else if (usedRatio <= expectedRatio * 0.75) {
    code = "UNDER";
  } else {
    code = "ON_TRACK";
  }
  let summary: string;
  if (code === "EXCESS" && historyDaysToExhaust != null) {
    summary = `${base.toolLabel} is above pace and reaches its limit in ~${formatDuration(historyDaysToExhaust)} — before reset (${formatDuration(daysToReset)} left).`;
  } else if (code === "UNDER") {
    summary = `${base.toolLabel} is underutilized (${Math.round(usedPercent)}% used vs ~${Math.round(expectedPercent)}% expected).`;
  } else if (code === "ON_TRACK" && historyDaysToExhaust != null) {
    summary = `${base.toolLabel} is on pace; resets in ${formatDuration(daysToReset)}.`;
  } else {
    summary = `${base.toolLabel} · ${Math.round(usedPercent)}% of ${base.windowLabel.toLowerCase()} window.`;
  }
  return {
    ...base,
    code,
    usedPercent,
    expectedPercent,
    daysToExhaust: historyDaysToExhaust,
    daysToReset,
    exhaustAt: historyExhaustAt,
    summary,
    projectionState: "reliable",
  };
}

/**
 * Project whether current burn empties the plan before reset.
 * Above pace = projected to exhaust before the vendor window resets.
 */
export function projectQuotaPace(
  quota: QuotaUtilization,
  now: Date = new Date(),
): QuotaPace {
  const base = {
    toolKey: quota.toolKey,
    toolLabel: toolDisplayName(quota.toolKey),
    windowType: quota.windowType,
    windowLabel: quotaWindowLabel(quota.windowType),
    usedPercent: quota.rawRatio == null ? null : ratioToPercent(quota.rawRatio),
    expectedPercent: null as number | null,
    daysToExhaust: null as number | null,
    daysToReset: null as number | null,
    exhaustAt: null as string | null,
    resetsAt: quota.resetsAt,
    projectionState: "unavailable" as const,
  };

  if (quota.rawRatio == null) {
    return {
      ...base,
      code: "UNKNOWN",
      summary: `${base.toolLabel} has no live quota % yet.`,
    };
  }

  if (quota.rawRatio >= 1) {
    return {
      ...base,
      code: "ALREADY_EXCEEDED",
      summary: `${base.toolLabel} is already over the ${base.windowLabel.toLowerCase()} limit.`,
    };
  }

  if (quota.stale) {
    return {
      ...base,
      code: "UNKNOWN",
      summary: `${base.toolLabel} quota reading is stale · pace unavailable.`,
    };
  }

  const resetMs = quota.resetsAt ? new Date(quota.resetsAt).getTime() : NaN;
  const periodStartMs = quota.periodStartsAt ? new Date(quota.periodStartsAt).getTime() : NaN;
  const inferredWindowMs = inferQuotaWindowMs(quota.windowType);
  const hasExactWindow =
    !Number.isNaN(periodStartMs) && !Number.isNaN(resetMs) && resetMs > periodStartMs;
  const windowMs = hasExactWindow ? resetMs - periodStartMs : inferredWindowMs;
  const startMs = hasExactWindow ? periodStartMs : Number.isNaN(resetMs) || !windowMs ? NaN : resetMs - windowMs;

  if (!windowMs || Number.isNaN(resetMs) || Number.isNaN(startMs)) {
    const pct = Math.round(quota.rawRatio * 100);
    return {
      ...base,
      code: "UNKNOWN",
      summary: `${base.toolLabel} is at ${pct}% · reset timing unavailable, so pace cannot be calculated.`,
    };
  }

  const nowMs = now.getTime();
  if (resetMs <= nowMs || startMs > nowMs) {
    return {
      ...base,
      code: "UNKNOWN",
      summary: `${base.toolLabel} is at ${Math.round(quota.rawRatio * 100)}% · vendor window timing is not current.`,
    };
  }
  const elapsedMs = Math.max(1, Math.min(windowMs, nowMs - startMs));
  const remainingMs = resetMs - nowMs;
  const expectedRatio = elapsedMs / windowMs;
  const usedRatio = quota.rawRatio;
  const daysToReset = remainingMs / DAY_MS;

  const expectedPercent = ratioToPercent(expectedRatio);
  const usedPercent = ratioToPercent(usedRatio);

  const linearProjection = () => {
    const burnPerMs = usedRatio / elapsedMs;
    const msToExhaust = burnPerMs > 0 ? (1 - usedRatio) / burnPerMs : Number.POSITIVE_INFINITY;
    const daysToExhaust = Number.isFinite(msToExhaust) ? msToExhaust / DAY_MS : null;
    const exhaustAt = daysToExhaust != null ? new Date(nowMs + msToExhaust).toISOString() : null;
    const code: QuotaPaceCode = msToExhaust < remainingMs
      ? "EXCESS"
      : usedRatio <= expectedRatio * 0.75
        ? "UNDER"
        : "ON_TRACK";
    const summary = code === "EXCESS" && daysToExhaust != null
      ? `${base.toolLabel} is above pace and reaches its limit in ~${formatDuration(daysToExhaust)} — before reset (${formatDuration(daysToReset)} left).`
      : code === "UNDER"
        ? `${base.toolLabel} is underutilized (${Math.round(usedPercent)}% used vs ~${Math.round(expectedPercent)}% expected).`
        : `${base.toolLabel} · ${Math.round(usedPercent)}% of ${base.windowLabel.toLowerCase()} window.`;
    return {
      ...base,
      code,
      expectedPercent,
      usedPercent,
      daysToExhaust,
      daysToReset,
      exhaustAt,
      summary,
      projectionState: "reliable" as const,
    };
  };

  const history = (quota.history ?? [])
    .filter((sample): sample is QuotaHistorySample => sample.resetAt === quota.resetsAt)
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  // Callers that do not provide history are legacy/estimated contexts. Keep
  // their prior static projection behavior; live quota cards always attach an
  // array (including an empty one).
  if (quota.history === undefined) return linearProjection();

  const currentBurn = historyBurn(history);
  if (currentBurn) {
    return projectFromBurnRate({
      base,
      burnPerMs: currentBurn.burnPerMs,
      usedRatio,
      expectedRatio,
      expectedPercent,
      usedPercent,
      daysToReset,
      remainingMs,
      nowMs,
      stableSummary: `${base.toolLabel} has no usage increase across the observed interval.`,
    });
  }

  const priorBurn = quota.resetsAt ? priorCycleBurn(quota.history ?? [], quota.resetsAt) : null;
  if (priorBurn) {
    return projectFromBurnRate({
      base,
      burnPerMs: priorBurn.burnPerMs,
      usedRatio,
      expectedRatio,
      expectedPercent,
      usedPercent,
      daysToReset,
      remainingMs,
      nowMs,
      stableSummary: `${base.toolLabel} has no usage increase since the last cycle.`,
    });
  }

  return linearProjection();
}

/** One primary pace row per tool from live device quota snapshots. */
export function projectMemberQuotaPaces(
  snapshots: QuotaSnapshotInput[],
  now: Date = new Date(),
): QuotaPace[] {
  const rows = dedupeQuotaUtilizations(mapQuotaSnapshots(snapshots, now));
  const byTool = new Map<string, QuotaUtilization[]>();
  for (const row of rows) {
    const list = byTool.get(row.toolKey) ?? [];
    list.push(row);
    byTool.set(row.toolKey, list);
  }

  const paces: QuotaPace[] = [];
  for (const toolRows of byTool.values()) {
    const primary = selectPrimaryQuota(toolRows);
    if (!primary) continue;
    paces.push(projectQuotaPace(primary, now));
  }

  return paces.sort((a, b) => {
    const rank = (code: QuotaPaceCode) =>
      code === "ALREADY_EXCEEDED"
        ? 0
        : code === "EXCESS"
          ? 1
          : code === "FORMING"
            ? 2
            : code === "ON_TRACK"
              ? 3
              : code === "STABLE"
                ? 4
                : code === "UNDER"
                  ? 5
                  : 6;
    const rankDiff = rank(a.code) - rank(b.code);
    if (rankDiff !== 0) return rankDiff;
    return (b.usedPercent ?? -1) - (a.usedPercent ?? -1);
  });
}

export function paceVerdictLabel(code: QuotaPaceCode): string {
  switch (code) {
    case "EXCESS":
      return "Above pace";
    case "ALREADY_EXCEEDED":
      return "Over limit";
    case "ON_TRACK":
      return "On pace";
    case "UNDER":
      return "Underutilized";
    case "STABLE":
      return "No recent change";
    case "FORMING":
      return "Awaiting next sync";
    default:
      return "Offline";
  }
}

export function paceToPlanVerdictCode(code: QuotaPaceCode): PlanVerdictCode | null {
  switch (code) {
    case "ALREADY_EXCEEDED":
      return "LIMIT_EXCEEDED";
    case "EXCESS":
      return "NEAR_LIMIT";
    case "ON_TRACK":
      return "HEALTHY";
    case "UNDER":
      return "LIGHT_USE";
    case "STABLE":
    case "FORMING":
      return null;
    default:
      return null;
  }
}

function synthesizeIncludedQuota(
  included: IncludedAllowanceUtilization,
  cycleWindow: PaceCycleWindow,
  now: Date,
): QuotaUtilization | null {
  if (included.rawRatio == null) return null;
  return {
    quotaKey: "included:month",
    label: "month",
    unit: "percent",
    limit: null,
    consumed: null,
    remaining: null,
    rawRatio: included.rawRatio,
    displayRatio: included.displayRatio,
    periodStartsAt: cycleWindow.startsAt,
    resetsAt: cycleWindow.endsAt,
    source: "estimated",
    observedAt: now.toISOString(),
    stale: false,
    toolKey: "included",
    windowType: "month",
    developerId: null,
    deviceId: null,
    observationToolName: "included",
  };
}

/**
 * Team / plan-usage verdict: prefer burn-rate projection when timing is known,
 * otherwise keep static ratio thresholds from evaluatePlanUtilization.
 */
export function paceAwarePlanVerdict(input: {
  primaryQuota: QuotaUtilization | null;
  included: IncludedAllowanceUtilization | null;
  cycleWindow?: PaceCycleWindow | null;
  now?: Date;
}): PlanVerdict {
  const now = input.now ?? new Date();
  const base = evaluatePlanUtilization({
    primaryQuota: input.primaryQuota,
    included: input.included,
  });
  if (base.code === "DATA_STALE") return base;

  const quotaForPace =
    input.primaryQuota?.rawRatio != null
      ? input.primaryQuota
      : input.included && input.cycleWindow
        ? synthesizeIncludedQuota(input.included, input.cycleWindow, now)
        : null;
  if (!quotaForPace) return base;

  const pace = projectQuotaPace(quotaForPace, now);
  const code = paceToPlanVerdictCode(pace.code);
  if (!code) return base;

  return {
    code,
    severity: code === "LIMIT_EXCEEDED" ? "critical" : code === "NEAR_LIMIT" ? "warning" : "info",
    reasons: [...base.reasons, `pace_${pace.code.toLowerCase()}`],
    policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
  };
}
