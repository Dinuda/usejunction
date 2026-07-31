export const USAGE_WINDOW_PREFERENCES = [
  "auto",
  "session_5h",
  "daily",
  "weekly",
  "monthly",
  "annual",
] as const;

export type UsageWindowPreference = (typeof USAGE_WINDOW_PREFERENCES)[number] | `provider:${string}`;

export function normalizeUsageWindowPreference(value: string | null | undefined): UsageWindowPreference {
  const normalized = value?.trim().toLowerCase() || "auto";
  if ((USAGE_WINDOW_PREFERENCES as readonly string[]).includes(normalized)) {
    return normalized as UsageWindowPreference;
  }
  if (normalized.startsWith("provider:") && normalized.slice("provider:".length).trim()) {
    return `provider:${normalized.slice("provider:".length).trim()}`;
  }
  throw new Error("INVALID_USAGE_WINDOW_PREFERENCE");
}

export function usageWindowPreferenceMatches(
  preference: string | null | undefined,
  windowType: string,
): boolean {
  const selected = normalizeUsageWindowPreference(preference);
  const type = windowType.trim().toLowerCase();
  if (selected === "auto") return true;
  if (selected.startsWith("provider:")) return type === selected.slice("provider:".length);
  if (selected === "session_5h") return /session_5h|5[-_]?h|hour/i.test(type);
  if (selected === "weekly") return /week|seven_day/i.test(type);
  if (selected === "daily") return /day|daily/i.test(type) && !/week|seven_day/i.test(type);
  if (selected === "monthly") return /month|^plan$|^api$|^auto$|premium/i.test(type);
  if (selected === "annual") return /year|annual/i.test(type);
  return false;
}

export function usageWindowPreferenceLabel(preference: string | null | undefined): string {
  const selected = normalizeUsageWindowPreference(preference);
  if (selected === "auto") return "Auto-detected";
  if (selected === "session_5h") return "5-hour";
  if (selected === "daily") return "Daily";
  if (selected === "weekly") return "Weekly";
  if (selected === "monthly") return "Monthly";
  if (selected === "annual") return "Annual";
  return selected.slice("provider:".length).replaceAll("_", " ");
}

export function usageWindowFamily(windowType: string): UsageWindowPreference {
  const type = windowType.trim().toLowerCase();
  if (/session_5h|5[-_]?h|hour/i.test(type)) return "session_5h";
  if (/week|seven_day/i.test(type)) return "weekly";
  if (/day|daily/i.test(type)) return "daily";
  if (/month|^plan$|^api$|^auto$|premium/i.test(type)) return "monthly";
  if (/year|annual/i.test(type)) return "annual";
  return `provider:${type}`;
}

export function usageWindowDisplayLabel(windowType: string): string {
  return usageWindowPreferenceLabel(usageWindowFamily(windowType));
}
