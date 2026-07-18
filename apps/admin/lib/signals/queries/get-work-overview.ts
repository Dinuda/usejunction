import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { SignalsActivityInput } from "@/lib/signals/contracts/activity.v1";
import type { SignalsTrendPoint } from "@/lib/signals/contracts/shared";
import { sharePercent } from "@/lib/signals/policies/aggregates";
import { buildDailyTrendPoints } from "@/lib/signals/policies/rollup";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";
import { readLocalWorkSessionsWindow } from "@/lib/signals/readers/work-sessions";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
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

export async function getWorkOverview(
  context: InsightContext,
  input: SignalsActivityInput = {},
): Promise<InsightEnvelope<WorkOverviewV1>> {
  assertInsightRoles(context, rolesFor("org_overview"));
  const policy = await getOrgSignalsPolicy(context.orgId);
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

  const rows = await readLocalWorkSessionsWindow(context.orgId, {
    from: windows.current.from,
    to: windows.current.to,
    ...windows.filters,
  });

  const people = new Set(rows.map((row) => row.developerId));
  const models = new Set(rows.map((row) => row.model).filter((model): model is string => Boolean(model)));
  const toolBuckets = new Map<string, { sessions: number; people: Set<string> }>();
  for (const row of rows) {
    const bucket = toolBuckets.get(row.toolName) ?? { sessions: 0, people: new Set<string>() };
    bucket.sessions += 1;
    bucket.people.add(row.developerId);
    toolBuckets.set(row.toolName, bucket);
  }

  const topTools = [...toolBuckets.entries()]
    .map(([tool, bucket]) => ({
      tool,
      sessions: bucket.sessions,
      people: bucket.people.size,
      sharePercent: sharePercent(bucket.sessions, rows.length),
    }))
    .sort((a, b) => b.sessions - a.sessions || b.people - a.people)
    .slice(0, 10);

  const trend = buildDailyTrendPoints(
    rows.map((row) => ({ at: row.observedAt, personId: row.developerId })),
    { from: windows.current.from, to: windows.current.to },
  );

  const recent = rows.slice(0, 12).map((session) => ({
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
    dataThrough: rows[0]?.observedAt ?? null,
    data: {
      enabled: true,
      sessions: rows.length,
      activePeople: people.size,
      models: models.size,
      trend,
      topTools,
      recent,
    },
  });
}
