import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { parseCycleView, type CycleView } from "@/lib/dashboard/cycle-view";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { resolveLinkedDeveloperId } from "@/lib/queries/me/resolve-developer";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getOrgOverview, overviewInputFromBounds, overviewInputFromRange } from "@/lib/insights";

function overviewInputForView(cycleView: CycleView, period: RollingPeriod) {
  if (cycleView !== "last_30_days") return { cycleView };
  if (period.kind === "custom") return overviewInputFromBounds(period.from, period.to);
  return overviewInputFromRange(period.days, new Date());
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const query = request.nextUrl.searchParams;
  const cycleView = parseCycleView(query.get("view") ?? undefined);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: query.get("days") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  });
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const scope = canSwitchAudience ? parseAudienceScope(query.get("scope")) : "team";

  if (principal.role === "user") {
    const personal = await getMeOverview(principal.orgId, principal.userId, principal.role);
    const loaded = performance.now();
    return appData(
      { kind: "personal" as const, scope: "you" as const, canSwitchAudience: false, personal },
      { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
    );
  }

  // Owner/admin You: personal metrics for the linked developer.
  if (canSwitchAudience && scope === "you") {
    const [linkedId, syncContext] = await Promise.all([
      resolveLinkedDeveloperId(principal.orgId, principal.userId),
      getLocalSyncContext(principal.orgId, principal.userId),
    ]);
    const personal = linkedId
      ? await getMeOverview(principal.orgId, principal.userId, principal.role)
      : null;
    const loaded = performance.now();
    return appData(
      {
        kind: "personal" as const,
        scope: "you" as const,
        canSwitchAudience: true,
        youUnlinked: !linkedId,
        personal,
        needsPersonalConnect: !syncContext || syncContext.deviceCount === 0,
        syncContext,
      },
      { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
    );
  }

  // Overview + sync context in parallel. Sync context already loads the
  // developer/devices row used for the connect banner — avoid a duplicate findFirst.
  const [overviewResult, syncContext] = await Promise.all([
    getOrgOverview(
      {
        orgId: principal.orgId,
        actorId: principal.userId,
        roles: [principal.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      overviewInputForView(cycleView, rollingPeriod),
    ).then((envelope) => ({ data: envelope.data, error: null as string | null })).catch(() => ({ data: null, error: "Could not load dashboard." })),
    getLocalSyncContext(principal.orgId, principal.userId),
  ]);
  const loaded = performance.now();

  return appData(
    {
      kind: "organization" as const,
      scope: "team" as const,
      canSwitchAudience,
      cycleView,
      rollingPeriod,
      overview: overviewResult.data,
      error: overviewResult.error,
      needsPersonalConnect: !syncContext || syncContext.deviceCount === 0,
      syncContext,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
