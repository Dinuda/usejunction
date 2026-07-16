import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsJourneysInput, SignalsJourneysV1 } from "@/lib/signals/contracts/journeys.v1";
import { aggregateJourneys, toJourneyRows } from "@/lib/signals/policies/rollup";
import { readSignalsSessionsWindow } from "@/lib/signals/readers/sessions";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";

export async function getSignalsJourneys(
  context: InsightContext,
  input: SignalsJourneysInput = {},
): Promise<InsightEnvelope<SignalsJourneysV1>> {
  assertInsightRoles(context, ["owner", "admin"]);
  const windows = resolveSignalsWindows(input, context.now);
  const [currentSessions, priorSessions] = await Promise.all([
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

  const journeys = toJourneyRows(aggregateJourneys(currentSessions), aggregateJourneys(priorSessions));
  return makeInsightEnvelope({
    context,
    kind: "signals-journeys",
    window: windows.current,
    dataThrough: currentSessions[0]?.startedAt ?? null,
    data: {
      range: windows.range,
      filters: {
        developerId: windows.filters.developerId ?? null,
        teamId: windows.filters.teamId ?? null,
        tool: windows.filters.tool ?? null,
      },
      journeys,
    },
  });
}
