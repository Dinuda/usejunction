import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { cycleViewPeriodLabel, reportWindowForCycleView } from "@/lib/dashboard/cycle-view";
import { parseMemberCycleSearch, workFiltersFromWindow } from "@/lib/developers/member-page-context";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { getWorkActivity } from "@/lib/signals/queries/get-work-activity";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { memberSectionSchema } from "@/lib/api/contracts";

export type TeamMemberSearch = {
  section?: string | null;
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function loadTeamMemberPage(
  principal: AppPrincipal,
  developerId: string,
  search: TeamMemberSearch = {},
) {
  const requestedSection = search.section ?? "overview";
  const section = memberSectionSchema.catch("overview").parse(requestedSection);
  const rawSearch = {
    view: search.view ?? undefined,
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  };
  const { cycleView, rollingPeriod } = parseMemberCycleSearch(rawSearch);
  const [roster, subscriptions] = await Promise.all([
    getDeveloperRoster(principal.orgId, { developerId }),
    listSubscriptions(principal.orgId),
  ]);
  const developer = roster.developers[0];
  if (!developer) return null;

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
  if (!personal) return null;

  return jsonSafe({
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
  });
}
