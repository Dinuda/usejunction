import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsOverviewInput, SignalsOverviewV1 } from "@/lib/signals/contracts/overview.v1";
import { changePercent } from "@/lib/signals/policies/aggregates";
import { buildRecommendedAction, buildSignalsInsight } from "@/lib/signals/policies/insight";
import {
  aggregateJourneys,
  aggregateTools,
  buildWeeklyTrend,
  summarizeWindow,
  toJourneyRows,
  toToolRows,
} from "@/lib/signals/policies/rollup";
import { readSignalsSessionsWindow } from "@/lib/signals/readers/sessions";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";

export async function getSignalsOverview(
  context: InsightContext,
  input: SignalsOverviewInput = {},
): Promise<InsightEnvelope<SignalsOverviewV1>> {
  assertInsightRoles(context, ["owner", "admin"]);
  const windows = resolveSignalsWindows(input, context.now);
  const [policy, currentSessions, priorSessions] = await Promise.all([
    getOrgSignalsPolicy(context.orgId),
    readSignalsSessionsWindow(context.orgId, {
      from: windows.current.from,
      to: windows.current.to,
      ...windows.filters,
    }),
    readSignalsSessionsWindow(context.orgId, {
      from: windows.prior.from,
      to: windows.prior.to,
      ...windows.filters,
    }),
  ]);

  const currentSummary = summarizeWindow(currentSessions);
  const priorSummary = summarizeWindow(priorSessions);
  const journeys = toJourneyRows(aggregateJourneys(currentSessions), aggregateJourneys(priorSessions));
  const tools = toToolRows(aggregateTools(currentSessions), aggregateTools(priorSessions));
  const topJourney = journeys[0] ?? null;
  const sessionsChange = changePercent(currentSummary.sessions, priorSummary.sessions);
  const journeySharePercent =
    topJourney && currentSummary.sessions > 0
      ? Math.round((topJourney.sessions / currentSummary.sessions) * 100)
      : 0;

  const data: SignalsOverviewV1 = {
    range: windows.range,
    policyEnabled: policy.enabled,
    insight: buildSignalsInsight({
      policyEnabled: policy.enabled,
      sessions: currentSummary.sessions,
      priorSessions: priorSummary.sessions,
      sessionsChangePercent: sessionsChange,
      topTools: tools,
      topJourney: topJourney
        ? { flow: topJourney.flow, sessions: topJourney.sessions, people: topJourney.people }
        : null,
    }),
    recommendedAction: buildRecommendedAction({
      policyEnabled: policy.enabled,
      topTool: tools[0]?.tool ?? null,
      topJourneyFlowKey: topJourney?.flowKey ?? null,
      sessions: currentSummary.sessions,
      journeySharePercent,
    }),
    kpis: {
      sessions: {
        value: currentSummary.sessions,
        previousValue: priorSummary.sessions,
        changePercent: sessionsChange,
      },
      activePeople: {
        value: currentSummary.activePeople,
        previousValue: priorSummary.activePeople,
        changePercent: changePercent(currentSummary.activePeople, priorSummary.activePeople),
      },
      timeAroundAiSeconds: {
        value: currentSummary.durationSeconds,
        previousValue: priorSummary.durationSeconds,
        changePercent: changePercent(currentSummary.durationSeconds, priorSummary.durationSeconds),
      },
      topJourney: {
        flowKey: topJourney?.flowKey ?? null,
        flow: topJourney?.flow ?? null,
        sessions: topJourney?.sessions ?? 0,
      },
    },
    trend: buildWeeklyTrend(currentSessions, { from: windows.current.from, to: windows.current.to }),
    topJourneys: journeys.slice(0, 10),
    topTools: tools.slice(0, 10),
  };

  const dataThrough = currentSessions[0]?.startedAt ?? null;
  return makeInsightEnvelope({
    context,
    kind: "signals-overview",
    window: windows.current,
    dataThrough,
    data,
  });
}
