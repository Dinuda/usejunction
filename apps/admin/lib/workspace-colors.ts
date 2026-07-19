export const WORKSPACE_COLORS = [
  "#64748b",
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export const WORKSPACE_COLOR_LABELS: Record<WorkspaceColor, string> = {
  "#64748b": "Slate",
  "#0f766e": "Teal",
  "#2563eb": "Blue",
  "#7c3aed": "Violet",
  "#db2777": "Pink",
  "#ea580c": "Orange",
  "#ca8a04": "Gold",
  "#16a34a": "Green",
};

export function isWorkspaceColor(value: string | null | undefined): value is WorkspaceColor {
  return !!value && (WORKSPACE_COLORS as readonly string[]).includes(value);
}

/** Stable fallback when a workspace has no saved color. */
export function workspaceColorFromId(id: string): WorkspaceColor {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return WORKSPACE_COLORS[hash % WORKSPACE_COLORS.length]!;
}

export function resolveWorkspaceColor(id: string, color?: string | null): WorkspaceColor {
  if (isWorkspaceColor(color)) return color;
  return workspaceColorFromId(id);
}
