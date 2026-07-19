import { NextRequest, NextResponse } from "next/server";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { requireOrgRole, rolesFor } from "@/lib/rbac";
import { getSignalsOverview } from "@/lib/signals";
import { InvalidSignalsWindowError } from "@/lib/signals/queries/windows";

function invalidWindow(message: string) {
  return NextResponse.json(
    { error: message, hint: "Use days=1..366 or a valid from=YYYY-MM-DD&to=YYYY-MM-DD pair." },
    { status: 400 },
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  if (req.nextUrl.searchParams.has("range")) {
    return invalidWindow("range is no longer supported.");
  }

  const rawDays = req.nextUrl.searchParams.get("days");
  try {
    const envelope = await getSignalsOverview(
      {
        orgId: auth.orgId,
        actorId: auth.userId,
        roles: [auth.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      {
        days: rawDays == null ? undefined : Number(rawDays),
        from: req.nextUrl.searchParams.has("from")
          ? (req.nextUrl.searchParams.get("from") ?? undefined)
          : undefined,
        to: req.nextUrl.searchParams.has("to")
          ? (req.nextUrl.searchParams.get("to") ?? undefined)
          : undefined,
        developerId: req.nextUrl.searchParams.get("developerId") || undefined,
        teamId: req.nextUrl.searchParams.get("teamId") || undefined,
        tool: req.nextUrl.searchParams.get("tool") || undefined,
      },
    );

    const data = envelope.data;
    return NextResponse.json({
      windowDays: data.windowDays,
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
  } catch (error) {
    if (error instanceof InvalidSignalsWindowError) return invalidWindow(error.message);
    throw error;
  }
}
