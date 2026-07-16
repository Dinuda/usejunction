import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsActivityInput, SignalsActivityV1 } from "@/lib/signals/contracts/activity.v1";
import { flowKeyFromSession, signalsFlow } from "@/lib/signals/policies/flow";
import { readSignalsSessionsWindow } from "@/lib/signals/readers/sessions";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";

export async function getSignalsActivity(
  context: InsightContext,
  input: SignalsActivityInput = {},
): Promise<InsightEnvelope<SignalsActivityV1>> {
  assertInsightRoles(context, ["owner", "admin"]);
  const windows = resolveSignalsWindows(input, context.now);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const sessions = await readSignalsSessionsWindow(context.orgId, {
    from: windows.current.from,
    to: windows.current.to,
    ...windows.filters,
    take: limit,
  });

  return makeInsightEnvelope({
    context,
    kind: "signals-activity",
    window: windows.current,
    dataThrough: sessions[0]?.startedAt ?? null,
    data: {
      range: windows.range,
      filters: {
        developerId: windows.filters.developerId ?? null,
        teamId: windows.filters.teamId ?? null,
        tool: windows.filters.tool ?? null,
      },
      sessions: sessions.map((session) => ({
        id: session.id,
        person: session.developer.name,
        email: session.developer.email,
        flowKey: flowKeyFromSession(session),
        flow: signalsFlow(session),
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt.toISOString(),
        confidence: session.confidence,
      })),
    },
  });
}
