import { resolveReportWindow, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import { isIsoDate } from "@/lib/dashboard/period-prefs";
import { inclusiveDayCount, usageInclusiveEnd, utcDateOnly } from "@/lib/metrics/date-range";
import type { SignalsFiltersInput } from "@/lib/signals/contracts/shared";

export type SignalsQueryWindows = {
  windowDays: number;
  current: MetricWindow;
  prior: MetricWindow;
  filters: {
    developerId?: string;
    teamId?: string;
    tool?: string;
  };
};

export class InvalidSignalsWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSignalsWindowError";
  }
}

function resolveCurrentWindow(input: SignalsFiltersInput, now: Date): MetricWindow {
  const hasFrom = input.from != null;
  const hasTo = input.to != null;
  const hasDays = input.days != null;

  if (hasDays && (hasFrom || hasTo)) {
    throw new InvalidSignalsWindowError("Use either days or from/to, not both.");
  }
  if (hasFrom !== hasTo) {
    throw new InvalidSignalsWindowError("Both from and to are required for a custom window.");
  }

  if (hasFrom && hasTo) {
    if (!isIsoDate(input.from) || !isIsoDate(input.to) || input.from > input.to) {
      throw new InvalidSignalsWindowError("from and to must be valid YYYY-MM-DD dates in ascending order.");
    }
    const window = resolveReportWindow({ from: input.from, to: input.to, now });
    if (inclusiveDayCount(window.from, window.to) > 366) {
      throw new InvalidSignalsWindowError("Custom windows may not exceed 366 days.");
    }
    return window;
  }

  const days = input.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new InvalidSignalsWindowError("days must be a whole number from 1 to 366.");
  }
  return resolveReportWindow({ range: days, now });
}

export function resolveSignalsWindows(
  input: SignalsFiltersInput = {},
  now = new Date(),
): SignalsQueryWindows {
  const resolved = resolveCurrentWindow(input, now);
  const current: MetricWindow = {
    ...resolved,
    from: utcDateOnly(resolved.from),
    to: usageInclusiveEnd(resolved.to),
  };
  const windowDays = inclusiveDayCount(current.from, current.to);
  const priorTo = new Date(current.from.getTime() - 1);
  const priorFrom = new Date(current.from.getTime() - windowDays * 86_400_000);
  const prior: MetricWindow = {
    from: priorFrom,
    to: priorTo,
    timezone: current.timezone,
    grain: "day",
  };
  return {
    windowDays,
    current,
    prior,
    filters: {
      developerId: input.developerId,
      teamId: input.teamId,
      tool: input.tool,
    },
  };
}
