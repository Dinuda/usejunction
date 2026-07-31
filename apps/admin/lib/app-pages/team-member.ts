import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { cycleViewPeriodLabel, cycleViewWindows, reportWindowForCycleView, type CycleViewWindows } from "@/lib/dashboard/cycle-view";
import { parseMemberCycleSearch, workFiltersFromWindow } from "@/lib/developers/member-page-context";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { getWorkActivity } from "@/lib/signals/queries/get-work-activity";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import type { OrganizationRole } from "@/lib/rbac/permissions";

export type TeamMemberSearch = {
  view?: string | null;
  days?: string | null;
  from?: string | null;
  to?: string | null;
};

export type TeamMemberHubPayload = {
  developerId: string;
  developer: {
    id: string;
    name: string;
    email: string;
    role: OrganizationRole;
  };
  role: OrganizationRole;
  personal: NonNullable<Awaited<ReturnType<typeof getDeveloperOverview>>>;
  cycleView: ReturnType<typeof parseMemberCycleSearch>["cycleView"];
  rollingPeriod: ReturnType<typeof parseMemberCycleSearch>["rollingPeriod"];
  selectedPeriodLabel: string;
  cycleWindows: CycleViewWindows;
};

export type TeamMemberWorkPayload = {
  work: Awaited<ReturnType<typeof getWorkActivity>>["data"] | null;
  workExtractionEnabled: boolean;
};

function parseMemberSearch(search: TeamMemberSearch = {}) {
  return parseMemberCycleSearch({
    view: search.view ?? undefined,
    days: search.days ?? undefined,
    from: search.from ?? undefined,
    to: search.to ?? undefined,
  });
}

/** Identity + personal metrics — stable across member hub tabs. */
export async function loadTeamMemberHubPage(
  principal: AppPrincipal,
  developerId: string,
  search: TeamMemberSearch = {},
): Promise<TeamMemberHubPayload | null> {
  const { cycleView, rollingPeriod } = parseMemberSearch(search);
  const subscriptions = await listSubscriptions(principal.orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions);
  const cycleWindows = cycleViewWindows(subscriptions);
  const personal = await getDeveloperOverview(principal.orgId, developerId, {
    reportWindow,
    cycleView,
    includeOrgPlanSync: false,
  });
  if (!personal) return null;

  return jsonSafe({
    developerId,
    developer: {
      id: personal.developer.id,
      name: personal.developer.name,
      email: personal.developer.email,
      role: personal.developer.role,
    },
    role: principal.role,
    personal,
    cycleView,
    rollingPeriod,
    selectedPeriodLabel: cycleViewPeriodLabel(cycleView, rollingPeriod),
    cycleWindows,
  });
}

/** Work sessions slice — fetched only on overview/work tabs. */
export async function loadTeamMemberWorkPage(
  principal: AppPrincipal,
  developerId: string,
  search: TeamMemberSearch & { limit?: number } = {},
): Promise<TeamMemberWorkPayload> {
  const { cycleView, rollingPeriod } = parseMemberSearch(search);
  const subscriptions = await listSubscriptions(principal.orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions);
  const workFilters = workFiltersFromWindow(reportWindow);
  const limit = Math.min(Math.max(search.limit ?? 4, 1), 200);

  const workResult = await getWorkActivity(
    {
      orgId: principal.orgId,
      actorId: principal.userId,
      roles: [principal.role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    { developerId, ...workFilters, limit },
  );

  return jsonSafe({
    work: workResult?.data ?? null,
    workExtractionEnabled: workResult?.data.enabled ?? false,
  });
}

/** @deprecated Use loadTeamMemberHubPage + loadTeamMemberWorkPage. */
export async function loadTeamMemberPage(
  principal: AppPrincipal,
  developerId: string,
  search: TeamMemberSearch & { section?: string | null } = {},
) {
  const section = search.section ?? "overview";
  const hub = await loadTeamMemberHubPage(principal, developerId, search);
  if (!hub) return null;

  const needsWork = section === "overview" || section === "work";
  const work = needsWork
    ? await loadTeamMemberWorkPage(principal, developerId, {
        ...search,
        limit: section === "work" ? 200 : 4,
      })
    : { work: null, workExtractionEnabled: false };

  return jsonSafe({
    section,
    ...hub,
    work: work.work,
    workExtractionEnabled: work.workExtractionEnabled,
  });
}
