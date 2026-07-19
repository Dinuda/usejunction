import { notFound } from "next/navigation";
import {
  UTC_TIMEZONE,
  type MetricWindow,
} from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch, type RollingPeriod } from "@/lib/dashboard/period-prefs";
import { getDeveloperOverview } from "@/lib/queries/me/overview";
import { getDeveloperRoster, type DeveloperRosterData } from "@/lib/read-models/developers";
import { getWorkActivity } from "@/lib/signals/queries/get-work-activity";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

type SearchParams = { view?: string; days?: string; from?: string; to?: string };
export type MemberRosterDeveloper = DeveloperRosterData["developers"][number];

export function parseMemberCycleSearch(params: SearchParams): {
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
} {
  return {
    // Member hub defaults to rolling periods (period cycler); billing cycles stay opt-in.
    cycleView: params.view == null ? "last_30_days" : parseCycleView(params.view),
    rollingPeriod: parseRollingPeriodFromSearch(params),
  };
}

/** Inclusive UTC date bounds matching the hub metrics window. */
export function workFiltersFromWindow(window: MetricWindow): { from: string; to: string } {
  return {
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
  };
}

/** Preserve hub period params on in-hub links. */
export function memberPeriodQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.view) qs.set("view", params.view);
  if (params.days) qs.set("days", params.days);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function loadMemberIdentity(developerId: string) {
  const { orgId, role } = await requireWorkspaceRole(rolesFor("org_overview"));
  const roster = await getDeveloperRoster(orgId, { developerId });
  const developer = roster.developers[0];
  if (!developer) notFound();
  return { orgId, role, developer };
}

export async function loadMemberMetrics(developerId: string, searchParams: SearchParams) {
  const { orgId, userId, role } = await requireWorkspaceRole(rolesFor("org_overview"));
  const { cycleView, rollingPeriod } = parseMemberCycleSearch(searchParams);
  const [roster, subscriptions] = await Promise.all([
    getDeveloperRoster(orgId, { developerId }),
    listSubscriptions(orgId),
  ]);
  const rosterDeveloper = roster.developers[0];
  if (!rosterDeveloper) notFound();
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions);
  const personal = await getDeveloperOverview(orgId, developerId, { reportWindow });
  if (!personal) notFound();
  return {
    orgId,
    userId,
    role,
    rosterDeveloper,
    personal,
    cycleView,
    rollingPeriod,
    reportWindow,
    selectedPeriodLabel: cycleViewPeriodLabel(cycleView, rollingPeriod),
  };
}

export async function loadMemberWork(
  developerId: string,
  opts: {
    limit?: number;
    days?: number;
    from?: string;
    to?: string;
  } = {},
) {
  const { orgId, userId, role } = await requireWorkspaceRole(rolesFor("org_overview"));
  const now = new Date();
  const periodFilter =
    opts.days != null || opts.from || opts.to
      ? { days: opts.days, from: opts.from, to: opts.to }
      : { days: 90 };
  const [workEnvelope, signalsPolicy] = await Promise.all([
    getWorkActivity(
      { orgId, actorId: userId, roles: [role], now, timezone: UTC_TIMEZONE },
      { developerId, ...periodFilter, limit: opts.limit ?? 200 },
    ),
    getOrgSignalsPolicy(orgId),
  ]);
  return {
    orgId,
    role,
    work: workEnvelope.data,
    workExtractionEnabled: signalsPolicy.workExtractionEnabled,
  };
}
