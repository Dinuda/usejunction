import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { parseCycleView, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { getWorkActivity, readSignalsFilterOptions } from "@/lib/signals";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;
  const query = request.nextUrl.searchParams;
  const scope = parseAudienceScope(query.get("scope"));
  const cycleView = parseCycleView(query.get("view") ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({ days: query.get("days") ?? undefined, from: query.get("from") ?? undefined, to: query.get("to") ?? undefined });
  const now = new Date();
  const [subscriptions, options] = await Promise.all([listSubscriptions(principal.orgId), readSignalsFilterOptions(principal.orgId)]);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);

  // You always forces the principal's linked developer — ignore any developerId query.
  let developerId = scope === "team" ? (query.get("developerId") || undefined) : undefined;
  let youUnlinked = false;
  if (scope === "you") {
    const linkedId = await resolveLinkedDeveloperId(principal.orgId, principal.userId);
    if (!linkedId) {
      youUnlinked = true;
    } else {
      developerId = linkedId;
    }
  }

  const teamId = scope === "team" ? (query.get("teamId") || undefined) : undefined;
  const tool = query.get("tool") || undefined;

  const envelope = youUnlinked
    ? null
    : await getWorkActivity(
        { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now, timezone: UTC_TIMEZONE },
        {
          from: reportWindow.from.toISOString().slice(0, 10),
          to: reportWindow.to.toISOString().slice(0, 10),
          developerId,
          teamId,
          tool,
          limit: 100,
        },
      );

  const loaded = performance.now();
  return appData(
    {
      scope,
      canSwitchAudience: true,
      youUnlinked,
      cycleView,
      rollingPeriod,
      developerId,
      teamId,
      tool,
      options,
      work: envelope?.data ?? { enabled: false, sessions: [] },
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
