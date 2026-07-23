/** Canonical React Query keys for workspace page data. Keep in sync with RSC prefetch. */

export const workspaceContextKey = ["app", "workspace-context"] as const;

export function dashboardKey(queryString = "") {
  return ["app", "dashboard", queryString] as const;
}

export function teamKey(queryString = "") {
  return ["app", "team", queryString] as const;
}

export function teamMemberKey(developerId: string, section: string, periodQuery = "") {
  return ["app", "team", developerId, section, periodQuery] as const;
}

export function toolsKey(queryString = "") {
  return ["app", "tools", queryString] as const;
}

export function toolDetailKey(toolKey: string, queryString = "") {
  return ["app", "tools", toolKey, queryString] as const;
}

export function activityKey(queryString = "") {
  return ["app", "activity", queryString] as const;
}

export function activityReportsInlineKey(audience: "you" | "team") {
  return ["app", "activity", "reports", audience, "inline"] as const;
}

export function signalsOverviewKey(queryString = "") {
  return ["app", "signals", "overview", queryString] as const;
}

export function signalsActivityKey(queryString = "") {
  return ["app", "signals", "activity", queryString] as const;
}

export const signalsSettingsKey = ["app", "signals", "settings"] as const;

export function signalsWorkKey(sessionId: string) {
  return ["app", "signals", "work", sessionId] as const;
}

export const notificationPreferencesKey = ["app", "notification-preferences"] as const;

export const settingsKey = ["app", "settings"] as const;
