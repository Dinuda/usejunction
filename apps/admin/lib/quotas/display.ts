const RESET_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function quotaWindowLabel(windowType: string): string {
  switch (windowType) {
    case "session_5h":
      return "5-hour";
    case "weekly":
    case "seven_day":
      return "Weekly";
    case "credits":
      return "Credits";
    default:
      return windowType.replaceAll("_", " ");
  }
}

export function quotaResetLabel(resetAt: Date | string | null): string | null {
  if (!resetAt) return null;
  const date = resetAt instanceof Date ? resetAt : new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return `resets ${RESET_TIME_FORMAT.format(date)}`;
}
