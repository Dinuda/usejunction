import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { MemberWorkSessionList } from "@/components/developers/member-work-session-list";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsTrendChart } from "@/components/signals/signals-trend-chart";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { flowDisplayLabel } from "@/components/signals/flow-segment";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Button } from "@/components/ui/button";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getWorkOverview } from "@/lib/signals";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function SignalsOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(rolesFor("org_overview"));
  const cycleView = parseCycleView(firstParam(params.view));
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: firstParam(params.days),
    from: firstParam(params.from),
    to: firstParam(params.to),
  });
  const now = new Date();
  const subscriptions = await listSubscriptions(orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  const context = { orgId, actorId: userId, roles: [role], now, timezone: UTC_TIMEZONE };
  const filters = {
    from: isoDate(reportWindow.from),
    to: isoDate(reportWindow.to),
    developerId: firstParam(params.developerId) || undefined,
    teamId: firstParam(params.teamId) || undefined,
    tool: firstParam(params.tool) || undefined,
  };

  const envelope = await getWorkOverview(context, filters);
  const work = envelope.data;
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);
  const topTool = work.topTools[0] ?? null;

  return (
    <>
      <SignalsPageHeader
        title="Signals"
        description="What your team ships with local AI coding tools — not full chat transcripts."
      >
        <div className="flex justify-end">
          <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/signals" />
        </div>
      </SignalsPageHeader>

      {!work.enabled ? (
        <div className="mb-10 flex flex-col gap-3 border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <p className="max-w-2xl text-sm leading-6 text-foreground">
            Turn on work extraction under Settings to see structured coding-tool work from Cursor,
            Claude, and Codex.
          </p>
          <Button asChild variant="outline" className="shrink-0 rounded-none">
            <Link href="/settings">
              Open Settings
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            <SignalsKpi
              label="Work sessions"
              hero
              className="pl-5"
              value={work.sessions.toLocaleString()}
              sub={periodLabel}
            />
            <SignalsKpi
              label="Active people"
              className="sm:border-l sm:border-border sm:pl-8"
              value={work.activePeople.toLocaleString()}
              sub={work.activePeople === 1 ? "person with work" : "people with work"}
            />
            <SignalsKpi
              label="Models seen"
              className="xl:border-l xl:border-border xl:pl-8"
              value={work.models ? work.models.toLocaleString() : "—"}
              sub={work.models ? "distinct models" : "No models yet"}
            />
            <SignalsKpi
              label="Top tool"
              className="sm:border-l sm:border-border sm:pl-8"
              value={
                topTool ? (
                  <span className="inline-flex items-center gap-2">
                    <ToolLogoTile tool={topTool.tool} size="sm" light />
                    <span className="truncate text-2xl sm:text-3xl">
                      {flowDisplayLabel(topTool.tool, "ai")}
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
              sub={
                topTool ? (
                  <span className="flex flex-col gap-1.5">
                    <span>
                      {topTool.sessions} session{topTool.sessions === 1 ? "" : "s"} ·{" "}
                      {topTool.sharePercent}%
                    </span>
                    <Link
                      href="/signals/activity"
                      className="inline-flex w-fit items-center gap-0.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Open Activity
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </span>
                ) : (
                  "No tools yet"
                )
              }
            />
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="border bg-card p-5">
              <SignalsSectionHeader
                title="Daily trend."
                description="Work sessions by day in this window."
                bordered={false}
              />
              <SignalsTrendChart data={work.trend} />
            </section>
            <section className="border bg-card p-5">
              <SignalsSectionHeader
                title="Top tools."
                description="Where coding-tool work concentrates."
                bordered={false}
                action={
                  <Link
                    href="/signals/activity"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    All activity
                  </Link>
                }
              />
              {work.topTools.length ? (
                <ul className="space-y-4">
                  {work.topTools.slice(0, 5).map((tool) => (
                    <li key={tool.tool} className="flex items-center gap-3">
                      <ToolLogoTile tool={tool.tool} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {flowDisplayLabel(tool.tool, "ai")}
                          </p>
                          <p className="text-sm font-medium tabular-nums">{tool.sessions}</p>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full bg-muted">
                          <div
                            className="h-full bg-primary/80"
                            style={{ width: `${Math.max(Math.min(tool.sharePercent, 100), 0)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tool.people} {tool.people === 1 ? "person" : "people"} · {tool.sharePercent}% of
                          sessions
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No tool sessions yet.</p>
              )}
            </section>
          </div>

          <section className="mt-10 border bg-card p-5">
            <SignalsSectionHeader
              title="Recent work."
              description="Asks, change summaries, and file activity from local AI tools."
              bordered={false}
              action={
                <Link
                  href="/signals/activity"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  All activity
                </Link>
              }
            />
            {work.recent.length ? (
              <MemberWorkSessionList
                sessions={work.recent}
                density="table"
                fromTeam={false}
                showPerson
                maxHeightClass="max-h-[28rem]"
              />
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No extracted work in this window yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
