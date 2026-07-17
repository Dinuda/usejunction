import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsTrendChart } from "@/components/signals/signals-trend-chart";
import {
  changeLabel,
  durationLabel,
  FlowPath,
  SignalsKpi,
  SignalsSectionHeader,
} from "@/components/signals/signals-ui";
import { flowDisplayLabel } from "@/components/signals/flow-segment";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Button } from "@/components/ui/button";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getSignalsOverview, normalizeSignalsRange } from "@/lib/signals";
import { requireWorkspaceRole } from "@/lib/workspace-context";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function kpiChangeSub(previousValue: number, changePercent: number | null) {
  if (previousValue <= 0) return undefined;
  return changeLabel(changePercent);
}

export default async function SignalsOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const range = normalizeSignalsRange(firstParam(params.range));
  const envelope = await getSignalsOverview(
    { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
    {
      range,
      developerId: firstParam(params.developerId) || undefined,
      teamId: firstParam(params.teamId) || undefined,
      tool: firstParam(params.tool) || undefined,
    },
  );
  const data = envelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Signals"
        description="Where AI sits in work — journeys, not content."
      />

      {!data.policyEnabled ? (
        <div className="mb-10 flex flex-col gap-3 bg-brand-yellow-pale p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="inline-flex w-fit items-center bg-brand-yellow px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-yellow-dark">
              Insight
            </span>
            <p className="max-w-2xl text-sm leading-6 text-foreground">{data.insight}</p>
          </div>
          <Button asChild variant="signal" className="shrink-0 rounded-none">
            <Link href="/signals/settings">
              Open Boundaries
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-10 flex flex-col gap-2 bg-brand-yellow-pale p-5 sm:p-6">
            <span className="inline-flex w-fit items-center bg-brand-yellow px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-yellow-dark">
              Insight
            </span>
            <p className="max-w-2xl text-sm leading-6 text-foreground">{data.insight}</p>
          </div>

          <div className="grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            <SignalsKpi
              label="AI sessions"
              hero
              className="pl-5"
              value={data.kpis.sessions.value.toLocaleString()}
              sub={kpiChangeSub(data.kpis.sessions.previousValue, data.kpis.sessions.changePercent)}
            />
            <SignalsKpi
              label="Active people"
              className="sm:border-l sm:border-border sm:pl-8"
              value={data.kpis.activePeople.value.toLocaleString()}
              sub={kpiChangeSub(data.kpis.activePeople.previousValue, data.kpis.activePeople.changePercent)}
            />
            <SignalsKpi
              label="Time around AI"
              className="xl:border-l xl:border-border xl:pl-8"
              value={durationLabel(data.kpis.timeAroundAiSeconds.value)}
              sub={kpiChangeSub(
                data.kpis.timeAroundAiSeconds.previousValue,
                data.kpis.timeAroundAiSeconds.changePercent,
              )}
            />
            <SignalsKpi
              label="Top journey"
              className="sm:border-l sm:border-border sm:pl-8"
              value={
                data.kpis.topJourney.flow ? (
                  <FlowPath flow={data.kpis.topJourney.flow} density="icons" size="lg" />
                ) : (
                  "—"
                )
              }
              sub={
                data.kpis.topJourney.flowKey ? (
                  <span className="flex flex-col gap-1.5">
                    <span>
                      {data.kpis.topJourney.sessions
                        ? `${data.kpis.topJourney.sessions} sessions`
                        : "No journeys yet"}
                    </span>
                    <Link
                      href={
                        data.recommendedAction?.href ??
                        `/signals/journeys/${encodeURIComponent(data.kpis.topJourney.flowKey)}`
                      }
                      className="inline-flex w-fit items-center gap-0.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {data.recommendedAction?.label ?? "Open this journey"}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </span>
                ) : (
                  "No journeys yet"
                )
              }
            />
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="border bg-card p-5">
              <SignalsSectionHeader
                title="Weekly trend."
                description="Sessions by week in this window."
                bordered={false}
              />
              <SignalsTrendChart data={data.trend} />
            </section>
            <section className="border bg-card p-5">
              <SignalsSectionHeader
                title="Top tools."
                description="Where AI sessions concentrate."
                bordered={false}
                action={
                  <Link
                    href="/signals/tools"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    All tools
                  </Link>
                }
              />
              {data.topTools.length ? (
                <ul className="space-y-4">
                  {data.topTools.slice(0, 5).map((tool) => (
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
              title="Top journeys."
              description="Before → AI → after patterns, aggregated."
              bordered={false}
              action={
                <Link
                  href="/signals/journeys"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  All journeys
                </Link>
              }
            />
            {data.topJourneys.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    <tr>
                      <th className="pb-3 pr-4 pt-1 font-medium">Journey</th>
                      <th className="pb-3 pr-4 pt-1 text-right font-medium">People</th>
                      <th className="pb-3 pr-4 pt-1 text-right font-medium">Sessions</th>
                      <th className="pb-3 pr-4 pt-1 text-right font-medium">Median</th>
                      <th className="pb-3 pr-4 pt-1 text-right font-medium">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topJourneys.map((journey) => (
                      <tr key={journey.flowKey} className="transition-colors hover:bg-muted/30">
                        <td className="py-5 pr-4">
                          <Link
                            href={`/signals/journeys/${encodeURIComponent(journey.flowKey)}`}
                            className="hover:underline"
                          >
                            <FlowPath flow={journey.flow} density="compact" />
                          </Link>
                        </td>
                        <td className="py-5 pr-4 text-right tabular-nums">{journey.people}</td>
                        <td className="py-5 pr-4 text-right tabular-nums">{journey.sessions}</td>
                        <td className="py-5 pr-4 text-right tabular-nums">
                          {durationLabel(journey.medianDurationSeconds)}
                        </td>
                        <td className="py-5 pr-4 text-right tabular-nums text-muted-foreground">
                          {changeLabel(journey.changePercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No journeys in this window yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
