import type { BillingCadence } from "@/lib/tools/catalog";
import { canonicalToolKey, catalogPrice, findCatalogPlan, toolUsageNames } from "@/lib/tools/catalog";
import { isSecondaryQuotaWindow } from "@/lib/quotas/display";
import { utcDateOnly } from "@/lib/metrics/date-range";

export type QuotaResetRow = {
  toolName: string;
  windowType: string;
  usedPercent: number | null;
  resetAt: Date | null;
  updatedAt: Date;
};

export type DetectedCycleHint = {
  billingCadence: BillingCadence;
  nextRenewalDate: Date | null;
  windowType: string | null;
};

/** Quota windows that can seed a subscription billing renewal (not usage-only caps). */
export function isBillingGradeQuotaWindow(windowType: string): boolean {
  return /month|plan|^api$|^auto$/i.test(windowType);
}

/** Prefer plan/monthly pressure windows, then weekly; skip promo/bonus/5h/resets. */
export function cycleWindowRank(windowType: string): number {
  if (isSecondaryQuotaWindow(windowType)) return 99;
  if (/session_5h|5[-_]?h|hour/i.test(windowType)) return 98;
  if (isBillingGradeQuotaWindow(windowType)) return 0;
  if (/week|seven_day/i.test(windowType)) return 1;
  return 2;
}

export function cadenceFromQuotaWindow(windowType: string): BillingCadence {
  if (/week|seven_day/i.test(windowType)) return "weekly";
  if (isBillingGradeQuotaWindow(windowType)) return "monthly";
  return "monthly";
}

/** Tools whose seats are billed monthly — weekly/5h vendor windows are usage caps only. */
const MONTHLY_SEAT_BILLING_TOOLS = new Set([
  "chatgpt-codex",
  "claude",
  "antigravity",
  "cursor",
  "github-copilot",
]);

export function usesMonthlySeatBilling(toolKey: string): boolean {
  return MONTHLY_SEAT_BILLING_TOOLS.has(canonicalToolKey(toolKey));
}

/**
 * Subscription billing cadence for detected plans.
 * Claude / Antigravity / Cursor / Copilot / ChatGPT bill seats monthly even when
 * vendor quotas reset weekly.
 */
export function subscriptionBillingCadence(
  toolKey: string,
  quotaWindowType: string | null = null,
): BillingCadence {
  if (usesMonthlySeatBilling(toolKey)) return "monthly";
  if (quotaWindowType) return cadenceFromQuotaWindow(quotaWindowType);
  return "monthly";
}

/**
 * Prefer stored cadence only when the tool is not a known monthly-seat vendor.
 * Fixes overview bars that were wrongly weekly from usage-window sync.
 */
export function seatBillingCadenceForTool(
  toolKey: string | null | undefined,
  storedCadence: string | null | undefined,
): BillingCadence {
  if (usesMonthlySeatBilling(toolKey ?? "")) return "monthly";
  const stored = (storedCadence ?? "").trim().toLowerCase();
  if (stored === "weekly" || stored === "monthly" || stored === "annual" || stored === "custom") {
    return stored;
  }
  return "monthly";
}

export function selectCycleQuota(rows: QuotaResetRow[]): QuotaResetRow | null {
  const withReset = rows.filter((row) => row.resetAt != null);
  const pool = withReset.length ? withReset : rows;
  if (!pool.length) return null;

  const primary = pool.filter((row) => cycleWindowRank(row.windowType) < 90);
  const candidates = primary.length ? primary : pool;

  return [...candidates].sort((a, b) => {
    const rank = cycleWindowRank(a.windowType) - cycleWindowRank(b.windowType);
    if (rank !== 0) return rank;
    // Prefer the newest reset boundary (current cycle), not the busiest stale window.
    const resetDelta = (b.resetAt?.getTime() ?? 0) - (a.resetAt?.getTime() ?? 0);
    if (resetDelta !== 0) return resetDelta;
    const updatedDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return (b.usedPercent ?? -1) - (a.usedPercent ?? -1);
  })[0] ?? null;
}

/** Pure mapping from quota snapshots → cadence + next renewal for detect sync. */
export function detectedCycleFromQuotas(
  rows: QuotaResetRow[],
  options: { toolKey?: string } = {},
): DetectedCycleHint {
  const toolKey = options.toolKey ?? "";
  const forceMonthlyBilling = usesMonthlySeatBilling(toolKey);

  // Weekly/5h quotas are usage windows only — never treat them as seat renewal.
  const billingRows = forceMonthlyBilling
    ? rows.filter((row) => row.resetAt && isBillingGradeQuotaWindow(row.windowType))
    : rows;

  const primary = selectCycleQuota(billingRows);
  const cadence = subscriptionBillingCadence(toolKey, primary?.windowType ?? null);

  if (!primary?.resetAt) {
    return { billingCadence: cadence, nextRenewalDate: null, windowType: null };
  }

  return {
    billingCadence: cadence,
    nextRenewalDate: utcDateOnly(primary.resetAt),
    windowType: primary.windowType,
  };
}

/** Seat micros for a detected cadence, falling back to monthly catalog price for weekly. */
export function detectedCycleSeatMicros(toolKey: string, catalogPlanKey: string, cadence: BillingCadence) {
  const plan = findCatalogPlan(toolKey, catalogPlanKey);
  if (!plan) return undefined;
  const priced = catalogPrice(plan, cadence);
  if (priced !== undefined) return priced;
  if (cadence === "weekly") return catalogPrice(plan, "monthly");
  return undefined;
}

export function quotaToolNamesForKey(toolKey: string) {
  return toolUsageNames(toolKey);
}
