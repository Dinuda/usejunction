import { NextRequest, NextResponse } from "next/server";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { requireOrgRole } from "@/lib/rbac";
import { getSignalsOverview, normalizeSignalsRange } from "@/lib/signals";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const range = normalizeSignalsRange(req.nextUrl.searchParams.get("range") ?? req.nextUrl.searchParams.get("days"));
  const envelope = await getSignalsOverview(
    {
      orgId: auth.orgId,
      actorId: auth.userId,
      roles: [auth.role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    {
      range,
      developerId: req.nextUrl.searchParams.get("developerId") || undefined,
      teamId: req.nextUrl.searchParams.get("teamId") || undefined,
      tool: req.nextUrl.searchParams.get("tool") || undefined,
    },
  );

  const data = envelope.data;
  return NextResponse.json({
    windowDays: range,
    insight: data.insight,
    kpis: {
      sessions: data.kpis.sessions.value,
      activeDevelopers: data.kpis.activePeople.value,
      durationSeconds: data.kpis.timeAroundAiSeconds.value,
      averageDurationSeconds: data.topJourneys[0]?.averageDurationSeconds ?? 0,
      sessionsChangePercent: data.kpis.sessions.changePercent,
    },
    trend: data.trend,
    topFlows: data.topJourneys.map((flow) => ({
      flow: flow.flow,
      flowKey: flow.flowKey,
      sessions: flow.sessions,
      people: flow.people,
      averageDurationSeconds: flow.averageDurationSeconds,
      medianDurationSeconds: flow.medianDurationSeconds,
      changePercent: flow.changePercent,
      lastSeenAt: flow.lastSeenAt,
    })),
    byTool: data.topTools,
    recentSessions: [],
  });
}
