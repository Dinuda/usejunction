import { resolveReportWindow, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import type { SignalsFiltersInput, SignalsRange } from "@/lib/signals/contracts/shared";
import { normalizeSignalsRange } from "@/lib/signals/contracts/shared";

export type SignalsQueryWindows = {
  range: SignalsRange;
  current: MetricWindow;
  prior: MetricWindow;
  filters: {
    developerId?: string;
    teamId?: string;
    tool?: string;
  };
};

export function resolveSignalsWindows(
  input: SignalsFiltersInput = {},
  now = new Date(),
): SignalsQueryWindows {
  const range = normalizeSignalsRange(input.range);
  const current = resolveReportWindow({ range, now });
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
    range,
    current,
    prior,
    filters: {
      developerId: input.developerId,
      teamId: input.teamId,
      tool: input.tool,
    },
  };
}
