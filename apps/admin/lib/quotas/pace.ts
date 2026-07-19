import { quotaWindowLabel } from "@/lib/quotas/display";
import {
  dedupeQuotaUtilizations,
  mapQuotaSnapshots,
  selectPrimaryQuota,
  type QuotaSnapshotInput,
  type QuotaUtilization,
} from "@/lib/quotas/plan-utilization-policy";
import { toolDisplayName } from "@/lib/tools/catalog";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

  const windowMs = inferQuotaWindowMs(quota.windowType);
  const resetMs = quota.resetsAt ? new Date(quota.resetsAt).getTime() : NaN;
  if (!windowMs || Number.isNaN(resetMs)) {
    const pct = Math.round(quota.rawRatio * 100);
    return {
      ...base,
      code: "UNKNOWN",
      summary: `${base.toolLabel} is at ${pct}% · reset timing unavailable, so pace cannot be calculated.`,
    };
  }

  const nowMs = now.getTime();
  const startMs = resetMs - windowMs;
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
