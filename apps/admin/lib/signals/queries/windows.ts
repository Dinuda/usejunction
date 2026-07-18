import { resolveReportWindow, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  parseRollingPeriodFromSearch,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import type { SignalsFiltersInput, SignalsRange } from "@/lib/signals/contracts/shared";
import { normalizeSignalsRange } from "@/lib/signals/contracts/shared";

export type SignalsQueryWindows = {
  range: SignalsRange;
  period: RollingPeriod;
  current: MetricWindow;
  prior: MetricWindow;
  filters: {
    developerId?: string;
    teamId?: string;
    tool?: string;
  };
};

function periodFromInput(input: SignalsFiltersInput): RollingPeriod {
  if (input.from || input.to || input.days != null) {
    return parseRollingPeriodFromSearch({
      days: input.days != null ? String(input.days) : undefined,
      from: input.from,
      to: input.to,
    });
  }
  // Legacy Signals `range=7|30|90` → nearest dashboard preset.
  if (input.range != null) {
    const legacy = normalizeSignalsRange(input.range);
    if (legacy === 7) return { kind: "preset", days: 3 };
    if (legacy === 90) return { kind: "preset", days: 90 };
    return { kind: "preset", days: 30 };
  }
  return parseRollingPeriodFromSearch({});
}

function rangeApprox(period: RollingPeriod): SignalsRange {
  if (period.kind === "preset") {
    if (period.days <= 7) return 7;
    if (period.days >= 90) return 90;
    return 30;
  }
  const ms = Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000) + 1;
  if (days <= 7) return 7;
  if (days >= 90) return 90;
  return 30;
}

export function resolveSignalsWindows(
  input: SignalsFiltersInput = {},
  now = new Date(),
): SignalsQueryWindows {
  const period = periodFromInput(input);
  const current =
    period.kind === "custom"
      ? resolveReportWindow({ from: period.from, to: period.to, now })
      : resolveReportWindow({ range: period.days, now });
  const spanMs = current.to.getTime() - current.from.getTime();
  const priorTo = new Date(current.from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - spanMs);
  const prior: MetricWindow = {
    from: priorFrom,
    to: priorTo,
    timezone: current.timezone,
    grain: "day",
  };
  return {
    range: rangeApprox(period),
    period,
    current,
    prior,
    filters: {
      developerId: input.developerId,
      teamId: input.teamId,
      tool: input.tool,
    },
  };
}
