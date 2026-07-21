import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { cycleViewPeriodLabel, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseMemberCycleSearch, workFiltersFromWindow } from "@/lib/developers/member-page-context";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { getWorkActivity } from "@/lib/signals/queries/get-work-activity";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { memberSectionSchema } from "@/lib/api/contracts";

export async function GET(request: NextRequest, { params }: { params: Promise<{ developerId: string }> }) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const developerId = (await params).developerId;
  const requestedSection = request.nextUrl.searchParams.get("section") ?? "overview";
  const section = memberSectionSchema.catch("overview").parse(requestedSection);
  const rawSearch = {
    view: request.nextUrl.searchParams.get("view") ?? undefined,
    days: request.nextUrl.searchParams.get("days") ?? undefined,
    from: request.nextUrl.searchParams.get("from") ?? undefined,
    to: request.nextUrl.searchParams.get("to") ?? undefined,
  };
  const { cycleView, rollingPeriod } = parseMemberCycleSearch(rawSearch);
  const [roster, subscriptions] = await Promise.all([
    getDeveloperRoster(principal.orgId, { developerId }),
    listSubscriptions(principal.orgId),
  ]);
  const developer = roster.developers[0];
  if (!developer) return appError("NOT_FOUND", "Team member not found.", 404);

  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions);
  const needsWork = section === "overview" || section === "work";
  const workFilters = workFiltersFromWindow(reportWindow);
  const personalPromise = getDeveloperOverview(principal.orgId, developerId, { reportWindow });
  const workPromise = needsWork
    ? getWorkActivity(
        {
          orgId: principal.orgId,
          actorId: principal.userId,
          roles: [principal.role],
          now: new Date(),
          timezone: UTC_TIMEZONE,
        },
        { developerId, ...workFilters, limit: section === "work" ? 200 : 50 },
      )
    : Promise.resolve(null);
  const [personal, workResult] = await Promise.all([personalPromise, workPromise]);
  if (!personal) return appError("NOT_FOUND", "Team member not found.", 404);
  const loaded = performance.now();

  return appData(
    {
      section,
      developerId,
      developer,
      role: principal.role,
      personal,
      cycleView,
      rollingPeriod,
      selectedPeriodLabel: cycleViewPeriodLabel(cycleView, rollingPeriod),
      work: workResult?.data ?? null,
      workExtractionEnabled: workResult?.data.enabled ?? false,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
