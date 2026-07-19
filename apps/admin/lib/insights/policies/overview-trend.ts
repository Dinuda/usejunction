import { DAY_MS, utcDateOnly } from "@/lib/metrics/date-range";

export type TrendPointInput = { date: string; modelCalls: number; cost: number };

export type FilledTrendPoint = {
  date: string;
  previousDate: string;
  requests: number;
  cost: number;
  previousRequests: number;
  previousCost: number;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Build a day series for the report window with a previous-period overlay.
 * - calendar: shift each day back by `range` days (rolling windows)
 * - index: align day N of current with day N of previous (billing cycles)
 */
export function fillOverviewTrend(
  range: number,
  from: Date,
  rows: TrendPointInput[],
  previousRows: TrendPointInput[],
  options: {
    align?: "calendar" | "index";
    previousFrom?: Date;
  } = {},
): FilledTrendPoint[] {
  const align = options.align ?? "calendar";
  const start = utcDateOnly(from);
  const previousStart = options.previousFrom ? utcDateOnly(options.previousFrom) : null;
  const current = new Map(rows.map((row) => [row.date, row]));
  const previous = new Map(previousRows.map((row) => [row.date, row]));

  return Array.from({ length: range }, (_, index) => {
    const day = new Date(start.getTime() + index * DAY_MS);
    const previousDay =
      align === "index" && previousStart
        ? new Date(previousStart.getTime() + index * DAY_MS)
        : new Date(day.getTime() - range * DAY_MS);
    const row = current.get(isoDay(day));
    const previousRow = previous.get(isoDay(previousDay));
    return {
      date: isoDay(day),
      previousDate: isoDay(previousDay),
      requests: row?.modelCalls ?? 0,
      cost: row?.cost ?? 0,
      previousRequests: previousRow?.modelCalls ?? 0,
      previousCost: previousRow?.cost ?? 0,
    };
  });
}
