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
  type QuotaUtilization,
} from "@/lib/quotas/plan-utilization-policy";
import { toolDisplayName } from "@/lib/tools/catalog";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type PaceCycleWindow = {
  startsAt: string;
  endsAt: string;
};

/** Pace vs the quota window: will they exhaust before reset? */
export type QuotaPaceCode =
  | "EXCESS"
  | "ON_TRACK"
  | "UNDER"
  | "ALREADY_EXCEEDED"
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
};

/** Infer billing-window length when providers omit periodStartsAt. */
export function inferQuotaWindowMs(windowType: string): number | null {
  if (/session_5h|5[-_]?h/i.test(windowType)) return 5 * HOUR_MS;
  if (/week|seven_day/i.test(windowType)) return 7 * DAY_MS;
  if (/day|daily/i.test(windowType)) return DAY_MS;
  if (/month|^plan$|^api$|^auto$|^copilot_/i.test(windowType)) return 30 * DAY_MS;
  return null;
}

function formatDuration(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 1.5) return "about a day";
  return `${Math.round(days)} days`;
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
    usedPercent: quota.rawRatio == null ? null : quota.rawRatio * 100,
    expectedPercent: null as number | null,
    daysToExhaust: null as number | null,
    daysToReset: null as number | null,
    exhaustAt: null as string | null,
    resetsAt: quota.resetsAt,
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
  const burnPerMs = usedRatio / elapsedMs;
  const msToExhaust = burnPerMs > 0 ? (1 - usedRatio) / burnPerMs : Number.POSITIVE_INFINITY;
  const daysToExhaust = Number.isFinite(msToExhaust) ? msToExhaust / DAY_MS : null;
  const daysToReset = remainingMs / DAY_MS;
  const exhaustAt =
    daysToExhaust != null && Number.isFinite(msToExhaust)
      ? new Date(nowMs + msToExhaust).toISOString()
      : null;

  const expectedPercent = expectedRatio * 100;
  const usedPercent = usedRatio * 100;

  let code: QuotaPaceCode;
  if (msToExhaust < remainingMs) {
    code = "EXCESS";
  } else if (usedRatio <= expectedRatio * 0.75) {
    code = "UNDER";
  } else {
    code = "ON_TRACK";
  }

  let summary: string;
  if (code === "EXCESS" && daysToExhaust != null) {
    summary = `${base.toolLabel} is above pace and burns out in ~${formatDuration(daysToExhaust)} — before reset (${formatDuration(daysToReset)} left).`;
  } else if (code === "UNDER") {
    summary = `${base.toolLabel} is underutilized (${Math.round(usedPercent)}% used vs ~${Math.round(expectedPercent)}% expected).`;
  } else if (code === "ON_TRACK" && daysToExhaust != null) {
    summary = `${base.toolLabel} is on pace — ~${formatDuration(daysToExhaust)} of runway left; resets in ${formatDuration(daysToReset)}.`;
  } else {
    summary = `${base.toolLabel} · ${Math.round(usedPercent)}% of ${base.windowLabel.toLowerCase()} window.`;
  }

  return {
    ...base,
    code,
    usedPercent,
    expectedPercent,
    daysToExhaust,
    daysToReset,
    exhaustAt,
    summary,
  };
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
      code === "ALREADY_EXCEEDED" ? 0 : code === "EXCESS" ? 1 : code === "ON_TRACK" ? 2 : code === "UNDER" ? 3 : 4;
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
    default:
      return "Pace unavailable";
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
