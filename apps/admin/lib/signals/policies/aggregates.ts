export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function changePercent(current: number, prior: number): number | null {
  // No baseline → not a growth rate. Callers should say "new" / omit %, not "+100%".
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

export function sharePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function startOfUtcWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay(); // 0 Sun
  const offset = weekday === 0 ? 6 : weekday - 1; // Monday-start
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}
