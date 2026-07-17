import { resolveReportWindow, UTC_TIMEZONE, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveBillingCycle, resolveBillingCycleOffset } from "@/lib/billing/cycles";
import { rollingPeriodLabel, type RollingPeriod } from "@/lib/dashboard/period-prefs";

export type CycleView = "current_cycles" | "previous_cycles" | "last_30_days";

type CyclePlan = Parameters<typeof resolveBillingCycle>[0];

export function parseCycleView(value: string | undefined): CycleView {
  if (value === "previous_cycles" || value === "last_30_days") return value;
  return "current_cycles";
}

export function reportWindowForCycleView(
  view: CycleView,
  period: RollingPeriod,
  plans: CyclePlan[],
  now: Date = new Date(),
): MetricWindow {
  if (view === "last_30_days") {
    return period.kind === "custom"
      ? resolveReportWindow({ from: period.from, to: period.to, now })
      : resolveReportWindow({ range: period.days, now });
  }

  const cycles = plans.map((plan) =>
    view === "previous_cycles"
      ? resolveBillingCycleOffset(plan, now, -1)
      : resolveBillingCycle(plan, now),
  );
  if (!cycles.length) return resolveReportWindow({ range: 30, now });

  const from = new Date(Math.min(...cycles.map((cycle) => cycle.cycleStart.getTime())));
  const to = new Date(Math.max(...cycles.map((cycle) => cycle.cycleEnd.getTime())) - 86_400_000);
  return { from, to, timezone: UTC_TIMEZONE, grain: "day" };
}

/** Human-readable description for KPI subs, e.g. "last 30 days". */
export function cycleViewPeriodLabel(view: CycleView, period: RollingPeriod): string {
  if (view === "current_cycles") return "current billing cycles";
  if (view === "previous_cycles") return "previous billing cycles";
  return rollingPeriodLabel(period).toLowerCase();
}

/** Compact suffix for table headers / inline meta, e.g. "30d" or "current". */
export function cycleViewShortSuffix(view: CycleView, period: RollingPeriod): string {
  if (view === "current_cycles") return "current";
  if (view === "previous_cycles") return "prev";
  if (period.kind === "preset") return `${period.days}d`;
  if (period.from === period.to) return period.from.slice(5);
  return `${period.from.slice(5)}–${period.to.slice(5)}`;
}
