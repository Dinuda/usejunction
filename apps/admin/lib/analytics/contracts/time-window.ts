import { usageWindowDays, utcDateOnly, usageInclusiveEnd } from "@/lib/metrics/date-range";

export type MetricWindow = {
  from: Date;
  to: Date;
  timezone: string;
  grain: "day";
};

export const UTC_TIMEZONE = "UTC";

export type ResolveReportWindowInput = {
  range?: number;
  from?: Date | string;
  to?: Date | string;
  timezone?: string;
  now?: Date;
};

/** Resolve a dashboard report window. Prisma adapter v1 requires UTC. */
export function resolveReportWindow(input: ResolveReportWindowInput = {}): MetricWindow {
  const timezone = input.timezone ?? UTC_TIMEZONE;
  if (timezone !== UTC_TIMEZONE) {
    throw new Error(`Unsupported timezone "${timezone}"; v1 supports UTC only`);
  }

  if (input.from != null && input.to != null) {
    return {
      from: utcDateOnly(typeof input.from === "string" ? new Date(input.from) : input.from),
      to: usageInclusiveEnd(typeof input.to === "string" ? new Date(input.to) : input.to),
      timezone: UTC_TIMEZONE,
      grain: "day",
    };
  }

  const range = input.range ?? 30;
  const window = usageWindowDays(range, input.now);
  return {
    from: window.from,
    to: window.to,
    timezone: UTC_TIMEZONE,
    grain: "day",
  };
}

export function serializeMetricWindow(window: MetricWindow) {
  return {
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
    grain: window.grain,
  };
}
