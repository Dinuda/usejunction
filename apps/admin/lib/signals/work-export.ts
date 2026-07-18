import { displayWorkTitle } from "@/lib/signals/work-display";
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import type { WorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";
import {
  formatTraceDuration,
  formatTraceLocation,
  formatTraceStats,
  type WorkTrace,
} from "@/lib/signals/work-trace";

export const WORK_SESSION_CSV_HEADERS = [
  "id",
  "observedAt",
  "startedAt",
  "endedAt",
  "person",
  "email",
  "title",
  "tldr",
  "tool",
  "model",
  "mode",
  "location",
  "duration",
  "durationSeconds",
  "approach",
  "skills",
  "tools",
  "files",
  "linesAdded",
  "linesRemoved",
  "filesChanged",
  "branch",
  "commits",
  "outcome",
  "acceptance",
  "intent",
  "source",
] as const;

export type WorkSessionCsvRow = Record<(typeof WORK_SESSION_CSV_HEADERS)[number], string>;

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowsToCsv(headers: readonly string[], rows: Array<Record<string, string>>) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

function joinList(values: string[] | null | undefined, limit = 40) {
  if (!values?.length) return "";
  return values.slice(0, limit).join("; ");
}

function toolsFromSession(
  trace: WorkTrace | null | undefined,
  toolCallCounts: Record<string, number> | null | undefined,
) {
  if (trace?.tools?.length) return joinList(trace.tools);
  if (!toolCallCounts) return "";
  return Object.entries(toolCallCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}×${count}`)
    .join("; ");
}

function rowFromTraceFields(input: {
  id: string;
  observedAt: string;
  startedAt?: string | null;
  endedAt?: string | null;
  person: string;
  email: string;
  title: string | null;
  tldr: string | null;
  toolName: string;
  model: string | null;
  mode: string | null;
  source: string;
  toolCallCounts: Record<string, number> | null;
  trace: WorkTrace | null;
  locationFallback?: string | null;
}): WorkSessionCsvRow {
  const trace = input.trace;
  return {
    id: input.id,
    observedAt: input.observedAt,
    startedAt: input.startedAt ?? "",
    endedAt: input.endedAt ?? "",
    person: input.person,
    email: input.email,
    title: displayWorkTitle(input.title, input.tldr),
    tldr: input.tldr ? displayWorkTitle(input.tldr) : "",
    tool: input.toolName,
    model: input.model ?? "",
    mode: input.mode ?? "",
    location: formatTraceLocation(trace) ?? input.locationFallback ?? "",
    duration: formatTraceDuration(trace) ?? "",
    durationSeconds:
      typeof trace?.durationSeconds === "number" ? String(trace.durationSeconds) : "",
    approach: trace?.approach?.trim() ?? "",
    skills: joinList(trace?.skills),
    tools: toolsFromSession(trace, input.toolCallCounts),
    files: joinList(trace?.files),
    linesAdded:
      typeof trace?.stats?.linesAdded === "number" ? String(trace.stats.linesAdded) : "",
    linesRemoved:
      typeof trace?.stats?.linesRemoved === "number" ? String(trace.stats.linesRemoved) : "",
    filesChanged:
      typeof trace?.stats?.filesChanged === "number" ? String(trace.stats.filesChanged) : "",
    branch: trace?.git?.branch ?? "",
    commits: joinList(trace?.git?.commits?.map((c) => `${c.sha} ${c.subject}`) ?? []),
    outcome: trace?.understanding?.outcome?.status ?? "",
    acceptance: trace?.understanding?.acceptance?.status ?? "",
    intent: trace?.understanding?.intent ?? "",
    source: input.source,
  };
}

export function workActivitySessionsToCsvRows(sessions: WorkActivitySession[]): WorkSessionCsvRow[] {
  return sessions.map((session) =>
    rowFromTraceFields({
      id: session.id,
      observedAt: session.observedAt,
      person: session.person,
      email: session.email,
      title: session.title,
      tldr: session.tldr,
      toolName: session.toolName,
      model: session.model,
      mode: session.mode,
      source: session.source,
      toolCallCounts: session.toolCallCounts,
      trace: session.trace,
    }),
  );
}

export function workSessionDetailToCsvRow(session: WorkSessionDetail): WorkSessionCsvRow {
  return rowFromTraceFields({
    id: session.id,
    observedAt: session.observedAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    person: session.developer.name,
    email: session.developer.email,
    title: session.title,
    tldr: session.tldr,
    toolName: session.toolName,
    model: session.model,
    mode: session.mode,
    source: session.source,
    toolCallCounts: session.toolCallCounts,
    trace: session.trace,
    locationFallback: session.locationLabel,
  });
}

export function workSessionsToCsv(sessions: WorkActivitySession[]) {
  return rowsToCsv(WORK_SESSION_CSV_HEADERS, workActivitySessionsToCsvRows(sessions));
}

export function workSessionDetailToCsv(session: WorkSessionDetail) {
  return rowsToCsv(WORK_SESSION_CSV_HEADERS, [workSessionDetailToCsvRow(session)]);
}

/** Diff label reused by list/detail UI. */
export function workDiffLabel(trace: WorkTrace | null | undefined) {
  return formatTraceStats(trace);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
