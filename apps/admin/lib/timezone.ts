/** IANA timezone helpers for daily reports (19:00 local). */

const IANA_TIMEZONE_RE = /^[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)+$|^UTC$/;

export function isValidIanaTimeZone(value: string | null | undefined): boolean {
  const tz = value?.trim();
  if (!tz || !IANA_TIMEZONE_RE.test(tz)) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: string | null | undefined, fallback = "UTC"): string {
  const tz = value?.trim();
  if (tz && isValidIanaTimeZone(tz)) return tz;
  return fallback;
}

/** YYYY-MM-DD in the given IANA timezone. */
export function localDateString(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Hour 0–23 in the given IANA timezone. */
export function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** Convert a wall-clock local datetime in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  localDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const tz = normalizeTimeZone(timeZone);
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid local date ${localDate}`);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const offset1 = tzOffsetMs(utcGuess, tz);
  const adjusted = new Date(Date.UTC(y, m - 1, d, hour, minute, 0) - offset1);
  const offset2 = tzOffsetMs(adjusted, tz);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, 0) - offset2);
}

export function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * Local calendar day window as UTC instants.
 * When `throughNow` is true, end is min(now, end of local day).
 */
export function localDayUtcWindow(input: {
  localDate: string;
  timeZone: string;
  now?: Date;
  throughNow?: boolean;
}): { from: Date; to: Date; localDate: string; timeZone: string } {
  const timeZone = normalizeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const from = zonedLocalToUtc(input.localDate, 0, 0, timeZone);
  const endOfDay = zonedLocalToUtc(addLocalDays(input.localDate, 1), 0, 0, timeZone);
  const to =
    input.throughNow === false ? endOfDay : new Date(Math.min(now.getTime(), endOfDay.getTime()));
  return { from, to, localDate: input.localDate, timeZone };
}

export const DAILY_REPORT_SEND_HOUR = 19;

/** Sunday — team/org weekly report send day (local). */
export const WEEKLY_ORG_REPORT_WEEKDAY = 0;

export function isDueForDailyReport(now: Date, timeZone: string): boolean {
  return localHour(now, timeZone) === DAILY_REPORT_SEND_HOUR;
}

/**
 * Mid-hour UTC probe for a Vercel "once per day per UTC hour" cron.
 * Hobby may fire anytime within the hour; sampling :30 keeps half-hour
 * offsets (e.g. Asia/Colombo) stable regardless of drift within the hour.
 */
export function utcHourProbeDate(now: Date, utcHour: number): Date {
  const hour = ((Math.trunc(utcHour) % 24) + 24) % 24;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 30, 0, 0),
  );
}

/** Parse hour from expressions like `5 14 * * *` (minute hour …). */
export function parseUtcHourFromCronSchedule(schedule: string | null | undefined): number | null {
  if (!schedule) return null;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const hour = Number(parts[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

export function parseUtcHourParam(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

/** Weekday 0 (Sun) … 6 (Sat) in the given IANA timezone. */
export function localWeekday(now: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

/** Calendar weekday for a YYYY-MM-DD local date (0=Sun … 6=Sat). */
export function weekdayOfLocalDate(localDate: string): number {
  return new Date(`${localDate}T12:00:00.000Z`).getUTCDay();
}

/**
 * Mon–Sun week whose Sunday is on or before `localDate`.
 * Used for team weekly report windows and delivery keys (`end` = Sunday).
 */
export function weekRangeEndingOnOrBefore(localDate: string): { start: string; end: string } {
  const dow = weekdayOfLocalDate(localDate);
  const end = addLocalDays(localDate, -dow);
  const start = addLocalDays(end, -6);
  return { start, end };
}

/** Team/org weekly email: Sunday at 19:00 local. */
export function isDueForWeeklyOrgReport(now: Date, timeZone: string): boolean {
  return (
    localWeekday(now, timeZone) === WEEKLY_ORG_REPORT_WEEKDAY &&
    localHour(now, timeZone) === DAILY_REPORT_SEND_HOUR
  );
}

/** Whether this timezone's 19:00 local falls in the given UTC hour bucket. */
export function isDueForDailyReportAtUtcHour(
  utcHour: number,
  timeZone: string,
  now = new Date(),
): boolean {
  return isDueForDailyReport(utcHourProbeDate(now, utcHour), timeZone);
}

export function isDueForWeeklyOrgReportAtUtcHour(
  utcHour: number,
  timeZone: string,
  now = new Date(),
): boolean {
  return isDueForWeeklyOrgReport(utcHourProbeDate(now, utcHour), timeZone);
}
