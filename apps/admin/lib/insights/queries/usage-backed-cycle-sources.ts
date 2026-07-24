import { utcDateOnly } from "@/lib/metrics/date-range";
import {
  canonicalToolKey,
  catalogPrice,
  findCatalogPlan,
  findCatalogTool,
  isCodingTool,
  toolUsageNames,
} from "@/lib/tools/catalog";
import { mapVendorPlanToCatalog } from "@/lib/tools/sync-detected";

/** Minimal subscription shape needed to append usage-backed cycle sources. */
export type UsageBackedCycleSource = {
  id: string;
  name: string;
  toolName: string;
  toolKey: string | null;
  usageToolNames: string[];
  billingCadence: string;
  billingCycleAnchorDate: Date | null;
  billingCycleDays: number | null;
  cycleSeatMicros: bigint;
  seatCount: number;
  startDate: Date;
  endDate: Date | null;
};

type ToolDayUsage = {
  toolName: string;
  requests: number;
};

function coveredToolKeys(subscriptions: Array<Pick<UsageBackedCycleSource, "toolKey" | "toolName" | "usageToolNames">>) {
  const covered = new Set<string>();
  for (const subscription of subscriptions) {
    const key = canonicalToolKey(subscription.toolKey ?? subscription.toolName ?? "");
    if (key) covered.add(key);
    for (const name of subscription.usageToolNames) {
      const usageKey = canonicalToolKey(name);
      if (usageKey) covered.add(usageKey);
    }
  }
  return covered;
}

function requestsByCodingTool(toolDays: ToolDayUsage[]) {
  const totals = new Map<string, { toolName: string; requests: number }>();
  for (const day of toolDays) {
    if (day.requests <= 0) continue;
    const key = canonicalToolKey(day.toolName);
    if (!isCodingTool(key)) continue;
    const existing = totals.get(key);
    if (existing) {
      existing.requests += day.requests;
      continue;
    }
    const tool = findCatalogTool(key);
    totals.set(key, {
      toolName: tool?.toolName ?? day.toolName,
      requests: day.requests,
    });
  }
  return totals;
}

function usageBackedSource(toolKey: string, toolName: string, now: Date): UsageBackedCycleSource {
  const catalogPlanKey = mapVendorPlanToCatalog(toolKey, null);
  const plan = findCatalogPlan(toolKey, catalogPlanKey) ?? findCatalogTool(toolKey)?.plans[0] ?? null;
  const cadence = "monthly" as const;
  const cycleSeatMicros = plan ? (catalogPrice(plan, cadence) ?? BigInt(0)) : BigInt(0);
  // Calendar-month anchor so usage-only rows get a normal renew window.
  const today = utcDateOnly(now);
  const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return {
    id: `usage:${toolKey}`,
    name: plan?.name ?? "Detected",
    toolName,
    toolKey,
    usageToolNames: toolUsageNames(toolKey),
    billingCadence: cadence,
    billingCycleAnchorDate: anchor,
    billingCycleDays: null,
    cycleSeatMicros,
    seatCount: 1,
    startDate: anchor,
    endDate: null,
  };
}

/**
 * Current cycles should surface coding tools with real traffic even when no
 * billing_plan_template exists yet (free/detected/$0 included). Prefer real
 * subscriptions; only synthesize catalog-backed sources for uncovered tools.
 */
export function mergeUsageBackedCycleSources<T extends UsageBackedCycleSource>(
  subscriptions: T[],
  toolDays: ToolDayUsage[],
  now: Date,
): Array<T | UsageBackedCycleSource> {
  const covered = coveredToolKeys(subscriptions);
  const extras: UsageBackedCycleSource[] = [];
  for (const [toolKey, usage] of requestsByCodingTool(toolDays)) {
    if (covered.has(toolKey)) continue;
    extras.push(usageBackedSource(toolKey, usage.toolName, now));
    covered.add(toolKey);
  }
  if (!extras.length) return subscriptions;
  return [...subscriptions, ...extras];
}
