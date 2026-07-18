import {
  formatThreadHint,
  formatTraceDuration,
  formatTraceGitSummary,
  formatTraceLocation,
  formatTracePhases,
  formatTraceSkills,
  formatTraceStats,
  formatTraceTools,
  formatUnderstandingSummary,
  type WorkTrace,
} from "@/lib/signals/work-trace";

export function WorkTraceDetails({
  trace,
  toolCallCounts,
}: {
  trace: WorkTrace | null | undefined;
  toolCallCounts?: Record<string, number> | null;
}) {
  const location = formatTraceLocation(trace);
  const tools =
    formatTraceTools(trace) ??
    (toolCallCounts
      ? Object.entries(toolCallCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, n]) => `${name}×${n}`)
          .join(" · ")
      : null);
  const skills = formatTraceSkills(trace);
  const stats = formatTraceStats(trace);
  const approach = trace?.approach?.trim() || null;
  const duration = formatTraceDuration(trace);
  const phases = formatTracePhases(trace);
  const git = formatTraceGitSummary(trace);
  const understanding = formatUnderstandingSummary(trace);
  const threadHint = formatThreadHint(trace);
  const files = trace?.files?.length
    ? trace.files.slice(0, 5).join(", ") + (trace.files.length > 5 ? ` +${trace.files.length - 5}` : "")
    : null;
  const summaryBits = [understanding, threadHint, duration, phases, git].filter(Boolean);

  if (!location && !tools && !skills && !stats && !approach && !files && !summaryBits.length) {
    return null;
  }

  return (
    <div className="mt-1.5 space-y-0.5 text-xs leading-5 text-muted-foreground">
      {summaryBits.length ? <div>{summaryBits.join(" · ")}</div> : null}
      {location ? <div>Where · {location}</div> : null}
      {approach ? <div>Approach · {approach}</div> : null}
      {skills ? <div>Skills · {skills}</div> : null}
      {tools ? <div>Tools · {tools}</div> : null}
      {files ? <div>Files · {files}</div> : null}
      {stats ? <div>Diff · {stats}</div> : null}
    </div>
  );
}
