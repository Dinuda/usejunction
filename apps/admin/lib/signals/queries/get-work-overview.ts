import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsActivityInput } from "@/lib/signals/contracts/activity.v1";
import type { SignalsTrendPoint } from "@/lib/signals/contracts/shared";
import { sharePercent } from "@/lib/signals/policies/aggregates";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";
import {
  readLocalWorkSessionOverviewAggregates,
  readLocalWorkSessionsRecent,
} from "@/lib/signals/readers/work-sessions";
import {
  getOrgSignalsPolicy,
  type EffectiveSignalsPolicy,
} from "@/lib/signals/service";
import { rolesFor } from "@/lib/rbac";
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import { asWorkToolCallCounts } from "@/lib/signals/queries/get-work-activity";

export type WorkOverviewToolRow = {
  tool: string;
  sessions: number;
  people: number;
  sharePercent: number;
};

export type WorkOverviewV1 = {
  enabled: boolean;
  sessions: number;
  activePeople: number;
  models: number;
  trend: SignalsTrendPoint[];
  topTools: WorkOverviewToolRow[];
  recent: WorkActivitySession[];
};

export type WorkOverviewOptions = {
  /** Preloaded policy so the route can fetch it in parallel with subscriptions. */
  policy?: EffectiveSignalsPolicy;
};

export async function getWorkOverview(
  context: InsightContext,
  input: SignalsActivityInput = {},
  options: WorkOverviewOptions = {},
): Promise<InsightEnvelope<WorkOverviewV1>> {
  assertInsightRoles(context, rolesFor("org_overview"));
  const policy = options.policy ?? (await getOrgSignalsPolicy(context.orgId));
  const windows = resolveSignalsWindows(input, context.now);

  if (!policy.workExtractionEnabled) {
    return makeInsightEnvelope({
      context,
      kind: "work-overview",
      window: windows.current,
      dataThrough: null,
      data: {
        enabled: false,
        sessions: 0,
        activePeople: 0,
        models: 0,
        trend: [],
        topTools: [],
        recent: [],
      },
    });
  }

  const windowOpts = {
    from: windows.current.from,
    to: windows.current.to,
    ...windows.filters,
  };

  const [aggregates, recentRows] = await Promise.all([
    readLocalWorkSessionOverviewAggregates(context.orgId, windowOpts),
    readLocalWorkSessionsRecent(context.orgId, windowOpts, 12),
  ]);

  const topTools = aggregates.topTools.map((row) => ({
    ...row,
    sharePercent: sharePercent(row.sessions, aggregates.sessions),
  }));

  const recent = recentRows.map((session) => ({
    id: session.id,
    person: session.developer.name,
    email: session.developer.email,
    toolName: session.toolName,
    model: session.model,
    mode: session.mode,
    title: session.title,
    tldr: session.tldr,
    overview: session.overview,
    observedAt: session.observedAt.toISOString(),
    source: session.source,
    toolCallCounts: asWorkToolCallCounts(session.toolCallCounts),
    trace: session.trace,
  }));

  return makeInsightEnvelope({
    context,
    kind: "work-overview",
    window: windows.current,
    dataThrough: aggregates.dataThrough ?? recentRows[0]?.observedAt ?? null,
    data: {
      enabled: true,
      sessions: aggregates.sessions,
      activePeople: aggregates.activePeople,
      models: aggregates.models,
      trend: aggregates.trend,
      topTools,
      recent,
    },
  });
}
