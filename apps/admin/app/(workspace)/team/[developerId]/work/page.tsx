import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MemberWorkSessionList } from "@/components/developers/member-work-session-list";
import { WorkCsvExportButton } from "@/components/signals/work-csv-export-button";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import {
  loadMemberMetrics,
  loadMemberWork,
  workFiltersFromWindow,
} from "@/lib/developers/member-page-context";
import { workSessionsToCsv } from "@/lib/signals/work-export";
import { formatTraceLocation } from "@/lib/signals/work-trace";
import { toolDisplayName } from "@/lib/tools/catalog";

function workSummary(sessions: Awaited<ReturnType<typeof loadMemberWork>>["work"]["sessions"]) {
  const tools = new Map<string, number>();
  const locations = new Map<string, number>();
  for (const session of sessions) {
    tools.set(session.toolName, (tools.get(session.toolName) ?? 0) + 1);
    const where = formatTraceLocation(session.trace);
    if (where) locations.set(where, (locations.get(where) ?? 0) + 1);
  }
  const topTool = [...tools.entries()].sort((a, b) => b[1] - a[1])[0];
  const topLocation = [...locations.entries()].sort((a, b) => b[1] - a[1])[0];
  return { topTool, topLocation };
}

export default async function MemberWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ developerId: string }>;
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { developerId } = await params;
  const paramsValue = await searchParams;
  const { reportWindow, selectedPeriodLabel } = await loadMemberMetrics(developerId, paramsValue);
  const { work, workExtractionEnabled } = await loadMemberWork(developerId, {
    limit: 200,
    ...workFiltersFromWindow(reportWindow),
  });
  const { topTool, topLocation } = workSummary(work.sessions);
  const csv = work.enabled && work.sessions.length ? workSessionsToCsv(work.sessions) : "";
  const filename = `work-${developerId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;

  return (
    <section className="border border-border/50 bg-white px-5 py-6 sm:px-6 sm:py-7">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Extracted work.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            What this person used AI for — titles, location, skills, tools ·{" "}
            {selectedPeriodLabel}. No prompts or chat bodies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {work.enabled && work.sessions.length ? (
            <WorkCsvExportButton filename={filename} csv={csv} />
          ) : null}
          <Link
            href={`/signals/activity?developerId=${encodeURIComponent(developerId)}`}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open in Signals
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </div>

      {!workExtractionEnabled || !work.enabled ? (
        <p className="py-2 text-sm text-muted-foreground">
          Work extraction is off. Enable it under{" "}
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
            Settings → Signals
          </Link>
          .
        </p>
      ) : work.sessions.length ? (
        <>
          <div className="mb-5 grid gap-4 border border-border/50 bg-[#fafafa] px-4 py-4 sm:grid-cols-3">
            <div className="pl-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Sessions
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
                {work.sessions.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{selectedPeriodLabel}</p>
            </div>
            <div className="pl-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Top tool
              </p>
              {topTool ? (
                <div className="mt-1.5 flex items-center gap-2.5">
                  <ToolLogoTile tool={topTool[0]} size="md" light />
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold tracking-tight">
                      {toolDisplayName(topTool[0])}
                    </p>
                    <p className="text-xs text-muted-foreground">{topTool[1]} sessions</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">—</p>
                  <p className="mt-1 text-xs text-muted-foreground">No tool mix yet</p>
                </>
              )}
            </div>
            <div className="pl-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Top project
              </p>
              <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight">
                {topLocation?.[0] ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {topLocation ? `${topLocation[1]} sessions` : "No location yet"}
              </p>
            </div>
          </div>

          <MemberWorkSessionList sessions={work.sessions} density="table" fromTeam />
        </>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">
          No extracted work sessions for {selectedPeriodLabel}.
        </p>
      )}
    </section>
  );
}
