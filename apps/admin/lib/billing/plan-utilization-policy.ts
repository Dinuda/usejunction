import { canonicalToolKey } from "@/lib/tools/catalog";

export const PLAN_UTILIZATION_POLICY_VERSION = "plan-utilization-v1" as const;

export const STALE_QUOTA_MS = 36 * 60 * 60 * 1000;

export type QuotaSnapshotInput = {
  toolName: string;
  windowType: string;
  usedPercent: number | null;
  creditsRemaining: number | null;
  resetAt: Date | null;
  source: string;
  updatedAt: Date;
  developerId?: string | null;
  deviceId?: string | null;
};

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
  includedMonthlyMicros: string;
  grossUsageMicros: string;
  rawRatio: number | null;
  displayRatio: number | null;
};

function mapSource(source: string): QuotaUtilization["source"] {
  if (source === "cli_rpc" || source === "vendor_verified" || source.startsWith("provider")) return "provider";
  if (source.includes("estimat")) return "estimated";
  return "observed";
}

function windowRank(windowType: string): number {
  if (/month/i.test(windowType)) return 0;
  if (/week/i.test(windowType)) return 1;
  return 2;
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
      resetsAt: snapshot.resetAt?.toISOString() ?? null,
      source: mapSource(snapshot.source),
      observedAt: snapshot.updatedAt.toISOString(),
      stale: now.getTime() - snapshot.updatedAt.getTime() > STALE_QUOTA_MS,
      toolKey,
      windowType: snapshot.windowType,
      developerId: snapshot.developerId ?? null,
    };
  });
}

/** Dedupe by tool+window keeping the highest rawRatio (and freshest on ties). */
export function dedupeQuotaUtilizations(rows: QuotaUtilization[]): QuotaUtilization[] {
  const map = new Map<string, QuotaUtilization>();
  for (const row of rows) {
    const key = `${row.toolKey}:${row.windowType}:${row.developerId ?? ""}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    const existingRatio = existing.rawRatio ?? -1;
    const nextRatio = row.rawRatio ?? -1;
    if (nextRatio > existingRatio) {
      map.set(key, row);
    } else if (nextRatio === existingRatio && row.observedAt > existing.observedAt) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

/**
 * Interim primary quota: prefer monthly, then weekly, then highest rawRatio.
 */
export function selectPrimaryQuota(rows: QuotaUtilization[]): QuotaUtilization | null {
  const usable = rows.filter((row) => !row.stale || row.rawRatio != null);
  if (!usable.length) return rows[0] ?? null;

  return [...usable].sort((a, b) => {
    const rank = windowRank(a.windowType) - windowRank(b.windowType);
    if (rank !== 0) return rank;
    return (b.rawRatio ?? -1) - (a.rawRatio ?? -1);
  })[0];
}

export function includedAllowanceUtilization(input: {
  includedMonthlyMicros: bigint | string | number;
  grossUsageMicros: bigint | string | number;
}): IncludedAllowanceUtilization {
  const included = BigInt(input.includedMonthlyMicros);
  const gross = BigInt(input.grossUsageMicros);
  const includedMonthlyMicros = included.toString();
  const grossUsageMicros = gross.toString();
  if (included <= BigInt(0)) {
    return { includedMonthlyMicros, grossUsageMicros, rawRatio: null, displayRatio: null };
  }
  const rawRatio = Number(gross) / Number(included);
  return {
    includedMonthlyMicros,
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
      return "Light use";
    case "HEALTHY":
      return "Steady";
    case "NEAR_LIMIT":
      return "Near limit";
    case "LIMIT_EXCEEDED":
      return "Over limit";
    case "DATA_STALE":
      return "Stale data";
    default:
      return "No signal";
  }
}
