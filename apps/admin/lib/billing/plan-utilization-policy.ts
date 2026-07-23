import { canonicalToolKey } from "@/lib/tools/catalog";
import { isSecondaryQuotaWindow } from "@/lib/quotas/display";

export const PLAN_UTILIZATION_POLICY_VERSION = "plan-utilization-v1" as const;

export const STALE_QUOTA_MS = 36 * 60 * 60 * 1000;

export type QuotaSnapshotInput = {
  toolName: string;
  windowType: string;
  usedPercent: number | null;
  creditsRemaining: number | null;
  /** Prisma Date, or ISO string after JSON/cache round-trips. */
  resetAt: Date | string | null;
  source: string;
  updatedAt: Date | string;
  developerId?: string | null;
  deviceId?: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date | string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

export type QuotaUtilization = {
  quotaKey: string;
  label: string;
  unit: "percent" | "credits";
  limit: number | null;
  consumed: number | null;
  remaining: number | null;
  rawRatio: number | null;
  displayRatio: number | null;
  periodStartsAt: string | null;
  resetsAt: string | null;
  source: "provider" | "observed" | "estimated";
  observedAt: string;
  stale: boolean;
  toolKey: string;
  windowType: string;
  developerId: string | null;
};

export type PlanVerdictCode =
  | "HEALTHY"
  | "LIGHT_USE"
  | "NEAR_LIMIT"
  | "LIMIT_EXCEEDED"
  | "DATA_STALE"
  | "UNKNOWN";

export type PlanVerdict = {
  code: PlanVerdictCode;
  severity: "info" | "warning" | "critical";
  reasons: string[];
  policyVersion: typeof PLAN_UTILIZATION_POLICY_VERSION;
};

export type IncludedAllowanceUtilization = {
  includedCycleMicros: string;
  grossUsageMicros: string;
  rawRatio: number | null;
  displayRatio: number | null;
};

function mapSource(source: string): QuotaUtilization["source"] {
  if (
    source === "cli_rpc" ||
    source === "oauth_api" ||
    source === "vendor_verified" ||
    source.startsWith("provider")
  ) return "provider";
  if (source.includes("estimat")) return "estimated";
  return "observed";
}

function windowRank(windowType: string): number {
  if (isSecondaryQuotaWindow(windowType)) return 99;
  if (/month|^plan$|copilot_premium/i.test(windowType)) return 0;
  if (/week|seven_day/i.test(windowType)) return 1;
  if (/day|daily|^api$|^auto$/i.test(windowType)) return 2;
  if (/session|5[-_]?h|hour|copilot_(chat|completions)/i.test(windowType)) return 3;
  return 4;
}

/**
 * Interim primary quota: prefer monthly, then weekly, then highest rawRatio.
 * Secondary windows (promo/grant/bonus/resets/credits) never win when a
 * billing-pressure window exists.
 */
export function selectPrimaryQuota(rows: QuotaUtilization[]): QuotaUtilization | null {
  const primaryCandidates = rows.filter((row) => !isSecondaryQuotaWindow(row.windowType));
  const candidates = primaryCandidates.length > 0 ? primaryCandidates : rows;
  const fresh = candidates.filter((row) => !row.stale);
  const pool = fresh.length > 0 ? fresh : candidates;
  if (!pool.length) return null;

  return [...pool].sort((a, b) => {
    const rank = windowRank(a.windowType) - windowRank(b.windowType);
    if (rank !== 0) return rank;
    const resetDelta = timestamp(b.resetsAt) - timestamp(a.resetsAt);
    if (resetDelta !== 0) return resetDelta;
    const observedDelta = timestamp(b.observedAt) - timestamp(a.observedAt);
    if (observedDelta !== 0) return observedDelta;
    return (b.rawRatio ?? -1) - (a.rawRatio ?? -1);
  })[0];
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Map QuotaSnapshot rows into QuotaUtilization values. Missing absolutes stay null. */
export function mapQuotaSnapshots(
  snapshots: QuotaSnapshotInput[],
  now: Date = new Date(),
): QuotaUtilization[] {
  return snapshots.map((snapshot) => {
    const toolKey = canonicalToolKey(snapshot.toolName) || snapshot.toolName;
    const rawRatio =
      snapshot.usedPercent == null || Number.isNaN(snapshot.usedPercent)
        ? null
        : snapshot.usedPercent / 100;
    const unit: QuotaUtilization["unit"] =
      snapshot.creditsRemaining != null && snapshot.usedPercent == null ? "credits" : "percent";
    const updatedAt = toDate(snapshot.updatedAt) ?? now;

    return {
      quotaKey: `${toolKey}:${snapshot.windowType}`,
      label: snapshot.windowType,
      unit,
      limit: null,
      consumed: null,
      remaining: snapshot.creditsRemaining,
      rawRatio,
      displayRatio: rawRatio == null ? null : Math.min(rawRatio, 1),
      periodStartsAt: null,
      resetsAt: toIso(snapshot.resetAt),
      source: mapSource(snapshot.source),
      observedAt: updatedAt.toISOString(),
      stale: now.getTime() - updatedAt.getTime() > STALE_QUOTA_MS,
      toolKey,
      windowType: snapshot.windowType,
      developerId: snapshot.developerId ?? null,
    };
  });
}

/** Dedupe by tool+window, preferring the current reset window and freshest reading. */
export function dedupeQuotaUtilizations(rows: QuotaUtilization[]): QuotaUtilization[] {
  const map = new Map<string, QuotaUtilization>();
  for (const row of rows) {
    const key = `${row.toolKey}:${row.windowType}:${row.developerId ?? ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const resetDelta = timestamp(row.resetsAt) - timestamp(existing.resetsAt);
    const observedDelta = timestamp(row.observedAt) - timestamp(existing.observedAt);
    if (resetDelta > 0 || (resetDelta === 0 && observedDelta > 0)) {
      map.set(key, row);
    } else if (
      resetDelta === 0 &&
      observedDelta === 0 &&
      (row.rawRatio ?? -1) > (existing.rawRatio ?? -1)
    ) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

export function includedAllowanceUtilization(input: {
  includedCycleMicros: bigint | string | number;
  grossUsageMicros: bigint | string | number;
}): IncludedAllowanceUtilization {
  const included = BigInt(input.includedCycleMicros);
  const gross = BigInt(input.grossUsageMicros);
  const includedCycleMicros = included.toString();
  const grossUsageMicros = gross.toString();
  if (included <= BigInt(0)) {
    return { includedCycleMicros, grossUsageMicros, rawRatio: null, displayRatio: null };
  }
  const rawRatio = Number(gross) / Number(included);
  return {
    includedCycleMicros,
    grossUsageMicros,
    rawRatio,
    displayRatio: Math.min(rawRatio, 1),
  };
}

/** Prefer live provider quota ratio; fall back to included-allowance ratio. */
export function primaryUtilizationRatio(input: {
  primaryQuota: QuotaUtilization | null;
  included: IncludedAllowanceUtilization | null;
}): number | null {
  if (input.primaryQuota?.rawRatio != null) return input.primaryQuota.rawRatio;
  return input.included?.rawRatio ?? null;
}

export function evaluatePlanUtilization(input: {
  primaryQuota: QuotaUtilization | null;
  included: IncludedAllowanceUtilization | null;
}): PlanVerdict {
  const reasons: string[] = [];
  const quota = input.primaryQuota;

  if (quota?.stale) {
    reasons.push("quota_data_stale");
    return {
      code: "DATA_STALE",
      severity: "warning",
      reasons,
      policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
    };
  }

  const ratio = primaryUtilizationRatio(input);
  if (ratio == null) {
    reasons.push("no_utilization_signal");
    return {
      code: "UNKNOWN",
      severity: "info",
      reasons,
      policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
    };
  }

  if (quota?.rawRatio != null) reasons.push("quota_raw_ratio");
  else reasons.push("included_allowance_ratio");

  if (ratio >= 1) {
    reasons.push("quota_raw_ratio_gte_1");
    return {
      code: "LIMIT_EXCEEDED",
      severity: "critical",
      reasons,
      policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
    };
  }
  if (ratio >= 0.85) {
    reasons.push("quota_raw_ratio_gte_0_85");
    return {
      code: "NEAR_LIMIT",
      severity: "warning",
      reasons,
      policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
    };
  }
  if (ratio < 0.25) {
    reasons.push("quota_raw_ratio_lt_0_25");
    return {
      code: "LIGHT_USE",
      severity: "info",
      reasons,
      policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
    };
  }
  reasons.push("quota_raw_ratio_healthy");
  return {
    code: "HEALTHY",
    severity: "info",
    reasons,
    policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
  };
}

export function verdictLabel(code: PlanVerdictCode): string {
  switch (code) {
    case "LIGHT_USE":
      return "Within allowance";
    case "HEALTHY":
      return "On track";
    case "NEAR_LIMIT":
      return "Near limit";
    case "LIMIT_EXCEEDED":
      return "Over quota";
    case "DATA_STALE":
      return "No quota data";
    default:
      return "No quota data";
  }
}

/** Short manager hint under the status chip. */
export function verdictHint(code: PlanVerdictCode): string | null {
  switch (code) {
    case "LIGHT_USE":
      return "Usage is well within the included plan allowance";
    case "HEALTHY":
      return "Usage is within the included plan allowance";
    case "NEAR_LIMIT":
      return "Likely to hit the plan cap before renewal";
    case "LIMIT_EXCEEDED":
      return "Included plan quota is already used up";
    case "DATA_STALE":
      return "Last quota reading is too old";
    default:
      return null;
  }
}

export function verdictToneClass(code: PlanVerdictCode): string {
  switch (code) {
    case "LIGHT_USE":
      return "text-muted-foreground";
    case "HEALTHY":
      return "text-primary";
    case "NEAR_LIMIT":
      return "text-brand-yellow-dark";
    case "LIMIT_EXCEEDED":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
