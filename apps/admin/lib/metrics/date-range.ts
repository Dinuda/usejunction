export const DAY_MS = 86_400_000;

export function utcDateOnly(value: Date = new Date()): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Inclusive end date for usage_daily DATE columns (includes today). */
export function usageInclusiveEnd(value: Date = new Date()): Date {
  return utcDateOnly(value);
}

/** Exclusive end bound: midnight UTC on the day after the inclusive end. */
export function usageExclusiveEnd(value: Date = new Date()): Date {
  return new Date(usageInclusiveEnd(value).getTime() + DAY_MS);
}

export type UsageWindow = {
  from: Date;
  to: Date;
  toExclusive: Date;
  previousFrom: Date;
  previousTo: Date;
  previousToExclusive: Date;
};

/** Calendar-day window of `days` days ending today (inclusive on both ends). */
export function usageWindowDays(days: number, now: Date = new Date()): UsageWindow {
  const to = usageInclusiveEnd(now);
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  const previousTo = new Date(from.getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY_MS);
  return {
    from,
    to,
    toExclusive: usageExclusiveEnd(to),
    previousFrom,
    previousTo,
    previousToExclusive: usageExclusiveEnd(previousTo),
  };
}

export function usageDayFilter(from: Date, to: Date) {
  return {
    gte: utcDateOnly(from),
    lt: usageExclusiveEnd(to),
  } as const;
}

export function usageDayFilterInclusive(from: Date, to: Date) {
  return {
    gte: utcDateOnly(from),
    lte: usageInclusiveEnd(to),
  } as const;
}

export function inclusiveDayCount(from: Date, to: Date) {
  const start = utcDateOnly(from);
  const end = usageInclusiveEnd(to);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}
