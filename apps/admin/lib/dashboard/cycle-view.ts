import { resolveReportWindow, UTC_TIMEZONE, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveBillingCycleOffset } from "@/lib/billing/cycles";
import { rollingPeriodLabel, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { reportNow } from "@/lib/report-now";

export type CycleView = "current_cycles" | "previous_cycles" | "last_30_days";

export type CycleWindowBounds = {
  from: string;
  to: string;
};

export type CycleViewWindows = {
  current: CycleWindowBounds;
  previous: CycleWindowBounds;
};

type CyclePlan = Parameters<typeof resolveBillingCycleOffset>[0];

function metricWindowToBounds(window: MetricWindow): CycleWindowBounds {
  return {
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
  };
}

/** Union billing-cycle windows for current and previous offsets across active plans. */
export function cycleViewWindows(
  plans: CyclePlan[],
  now: Date = reportNow(),
): CycleViewWindows {
  return {
    current: metricWindowToBounds(reportWindowForCycleOffset(plans, 0, now)),
    previous: metricWindowToBounds(reportWindowForCycleOffset(plans, -1, now)),
  };
}

export function parseCycleView(value: string | undefined): CycleView {
  if (value === "previous_cycles" || value === "last_30_days") return value;
  return "current_cycles";
}

/** Union window across all plans for a billing-cycle offset (0 = current, -1 = previous). */
export function reportWindowForCycleOffset(
  plans: CyclePlan[],
  offset: number,
  now: Date = reportNow(),
): MetricWindow {
  if (!plans.length) {
    const shiftedNow = new Date(now.getTime() + offset * 30 * 86_400_000);
    return resolveReportWindow({ range: 30, now: shiftedNow });
  }

  const cycles = plans.map((plan) => resolveBillingCycleOffset(plan, now, offset));
  const from = new Date(Math.min(...cycles.map((cycle) => cycle.cycleStart.getTime())));
  const to = new Date(Math.max(...cycles.map((cycle) => cycle.cycleEnd.getTime())) - 86_400_000);
  return { from, to, timezone: UTC_TIMEZONE, grain: "day" };
}

export function reportWindowForCycleView(
  view: CycleView,
  period: RollingPeriod,
  plans: CyclePlan[],
  now: Date = reportNow(),
): MetricWindow {
  if (view === "last_30_days") {
    return period.kind === "custom"
      ? resolveReportWindow({ from: period.from, to: period.to, now })
      : resolveReportWindow({ range: period.days, now });
  }

  return reportWindowForCycleOffset(plans, view === "previous_cycles" ? -1 : 0, now);
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
