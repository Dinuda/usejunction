import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsToolsInput, SignalsToolsV1 } from "@/lib/signals/contracts/tools.v1";
import { aggregateTools, toToolRows } from "@/lib/signals/policies/rollup";
import { readSignalsSessionsWindow } from "@/lib/signals/readers/sessions";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";
import { rolesFor } from "@/lib/rbac";

export async function getSignalsTools(
  context: InsightContext,
  input: SignalsToolsInput = {},
): Promise<InsightEnvelope<SignalsToolsV1>> {
  assertInsightRoles(context, rolesFor("org_overview"));
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

  const tools = toToolRows(aggregateTools(currentSessions), aggregateTools(priorSessions));
  return makeInsightEnvelope({
    context,
    kind: "signals-tools",
    window: windows.current,
    dataThrough: currentSessions[0]?.startedAt ?? null,
    data: {
      windowDays: windows.windowDays,
      filters: {
        developerId: windows.filters.developerId ?? null,
        teamId: windows.filters.teamId ?? null,
        tool: windows.filters.tool ?? null,
      },
      tools,
    },
  });
}
