export const DAY_MS = 86_400_000;

export function utcDateOnly(value: Date = new Date()): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** YYYY-MM-DD in UTC — for display / keys, not Prisma DateTime filters. */
export function utcDateString(value: Date = new Date()): string {
  return utcDateOnly(value).toISOString().slice(0, 10);
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

/**
 * Calendar-day window of `days` days ending today (inclusive on both ends).
 *
 * Important: Prisma `@db.Date` comparisons truncate DateTime filters to a calendar
 * date. Passing `lt: new Date()` (now) becomes `date < today` and drops today.
 * Always use {@link usageDayFilter} / exclusive tomorrow for open-ended "through today".
 */
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

/**
 * Inclusive [from, to] day filter for `usage_daily.date`.
 * Passes UTC-midnight DateTimes (not YYYY-MM-DD strings) — Prisma DateTime
 * args require ISO-8601 DateTime. Bound at tomorrow midnight so same-day
 * timestamps never truncate into excluding today.
 */
export function usageDayFilter(from: Date, to: Date) {
  return {
    gte: utcDateOnly(from),
    lt: usageExclusiveEnd(to),
  } as const;
}

export function usageDayFilterInclusive(from: Date, to: Date) {
  return {
    gte: utcDateOnly(from),
    lte: utcDateOnly(to),
  } as const;
}

export function inclusiveDayCount(from: Date, to: Date) {
  const start = utcDateOnly(from);
  const end = usageInclusiveEnd(to);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}
