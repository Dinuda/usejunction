type DateValue = Date | string | number;

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function validDate(value: DateValue): Date | null {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : value instanceof Date
      ? value
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) < 1 ? 3 : 2,
  }).format(value);
}

export function formatMicrosAsCurrency(value: string | bigint, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(BigInt(value)) / 1_000_000);
}

export function formatShortDate(value: DateValue): string {
  const date = validDate(value);
  return date ? SHORT_DATE_FORMAT.format(date) : "unknown";
}

export function formatDateTime(value: DateValue): string {
  const date = validDate(value);
  return date ? DATE_TIME_FORMAT.format(date) : "unknown";
}

export function formatRelativeTime(
  value: DateValue | null | undefined,
  now: Date | number = new Date(),
): string {
  if (value == null || value === "") return "never";
  const date = validDate(value);
  if (!date) return "unknown";
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return "unknown";
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  if (elapsedMs < 60_000) return "just now";
  if (elapsedMs < 3_600_000) return `${Math.floor(elapsedMs / 60_000)}m ago`;
  if (elapsedMs < 86_400_000) return `${Math.floor(elapsedMs / 3_600_000)}h ago`;
  if (elapsedMs < 7 * 86_400_000) return `${Math.floor(elapsedMs / 86_400_000)}d ago`;
  return formatShortDate(date);
}
