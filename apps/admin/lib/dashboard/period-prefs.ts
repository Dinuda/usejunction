export const DASHBOARD_PERIOD_STORAGE_KEY = "uj.dashboard.rolling-period";

export const PERIOD_PRESETS = [3, 30, 60, 90] as const;
export type PeriodPresetDays = (typeof PERIOD_PRESETS)[number];

export type PresetRollingPeriod = {
  kind: "preset";
  days: PeriodPresetDays;
};

export type CustomRollingPeriod = {
  kind: "custom";
  id: string;
  from: string;
  to: string;
};

export type RollingPeriod = PresetRollingPeriod | CustomRollingPeriod;

export type RollingPeriodPrefs = {
  active: RollingPeriod;
  saved: CustomRollingPeriod[];
};

export const DEFAULT_ROLLING_PERIOD: PresetRollingPeriod = { kind: "preset", days: 30 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPeriodPresetDays(value: number): value is PeriodPresetDays {
  return (PERIOD_PRESETS as readonly number[]).includes(value);
}

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shortUtcDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function rollingPeriodLabel(period: RollingPeriod): string {
  if (period.kind === "preset") return `Last ${period.days} days`;
  if (period.from === period.to) return shortUtcDate(period.from);
  return `${shortUtcDate(period.from)} – ${shortUtcDate(period.to)}`;
}

export function rollingPeriodHref(period: RollingPeriod, basePath = "/dashboard"): string {
  const params = new URLSearchParams({ view: "last_30_days" });
  if (period.kind === "preset") {
    if (period.days !== 30) params.set("days", String(period.days));
  } else {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  return `${basePath}?${params.toString()}`;
}

/** Query-only period href for pages that filter metrics without cycle views. */
export function metricPeriodHref(period: RollingPeriod, basePath: string): string {
  const params = new URLSearchParams();
  if (period.kind === "preset") {
    if (period.days !== 30) params.set("days", String(period.days));
  } else {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function rollingPeriodShortSuffix(period: RollingPeriod): string {
  if (period.kind === "preset") return `${period.days}d`;
  if (period.from === period.to) return period.from.slice(5);
  return `${period.from.slice(5)}–${period.to.slice(5)}`;
}

export function periodsEqual(a: RollingPeriod, b: RollingPeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "preset" && b.kind === "preset") return a.days === b.days;
  if (a.kind === "custom" && b.kind === "custom") {
    return a.from === b.from && a.to === b.to;
  }
  return false;
}

export function parseRollingPeriodFromSearch(params: {
  days?: string;
  from?: string;
  to?: string;
}): RollingPeriod {
  const from = params.from;
  const to = params.to;
  if (isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { kind: "custom", id: `custom:${from}:${to}`, from, to };
  }

  const days = Number(params.days);
  if (Number.isFinite(days) && isPeriodPresetDays(days)) {
    return { kind: "preset", days };
  }

  return DEFAULT_ROLLING_PERIOD;
}

function normalizeCustom(period: unknown): CustomRollingPeriod | null {
  if (!period || typeof period !== "object") return null;
  const value = period as Partial<CustomRollingPeriod>;
  if (value.kind !== "custom") return null;
  if (!isIsoDate(value.from) || !isIsoDate(value.to) || value.from > value.to) return null;
  return {
    kind: "custom",
    id: typeof value.id === "string" && value.id ? value.id : `custom:${value.from}:${value.to}`,
    from: value.from,
    to: value.to,
  };
}

function normalizeActive(period: unknown): RollingPeriod {
  if (!period || typeof period !== "object") return DEFAULT_ROLLING_PERIOD;
  const value = period as Partial<RollingPeriod>;
  if (value.kind === "preset" && typeof value.days === "number" && isPeriodPresetDays(value.days)) {
    return { kind: "preset", days: value.days };
  }
  return normalizeCustom(period) ?? DEFAULT_ROLLING_PERIOD;
}

export function readRollingPeriodPrefs(): RollingPeriodPrefs {
  if (typeof window === "undefined") {
    return { active: DEFAULT_ROLLING_PERIOD, saved: [] };
  }
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PERIOD_STORAGE_KEY);
    if (!raw) return { active: DEFAULT_ROLLING_PERIOD, saved: [] };
    const parsed = JSON.parse(raw) as Partial<RollingPeriodPrefs>;
    const saved = Array.isArray(parsed.saved)
      ? parsed.saved
          .map(normalizeCustom)
          .filter((item): item is CustomRollingPeriod => item != null)
          .slice(0, 8)
      : [];
    return { active: normalizeActive(parsed.active), saved };
  } catch {
    return { active: DEFAULT_ROLLING_PERIOD, saved: [] };
  }
}

export function writeRollingPeriodPrefs(prefs: RollingPeriodPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DASHBOARD_PERIOD_STORAGE_KEY, JSON.stringify(prefs));
}

export function setActiveRollingPeriod(period: RollingPeriod): RollingPeriodPrefs {
  const current = readRollingPeriodPrefs();
  const next: RollingPeriodPrefs = {
    active: period,
    saved:
      period.kind === "custom"
        ? [
            period,
            ...current.saved.filter((item) => !(item.from === period.from && item.to === period.to)),
          ].slice(0, 8)
        : current.saved,
  };
  writeRollingPeriodPrefs(next);
  return next;
}

export function removeSavedRollingPeriod(id: string): RollingPeriodPrefs {
  const current = readRollingPeriodPrefs();
  const next: RollingPeriodPrefs = {
    active:
      current.active.kind === "custom" && current.active.id === id
        ? DEFAULT_ROLLING_PERIOD
        : current.active,
    saved: current.saved.filter((item) => item.id !== id),
  };
  writeRollingPeriodPrefs(next);
  return next;
}
