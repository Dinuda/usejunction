import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import { PageHeader } from "@/components/page-header";
import { InvitePeopleDialog } from "@/components/team/team-connect-panel";
import { AgentUpdateCoverage } from "@/components/team/agent-update-coverage";
import { getAgentUpdateCoverage } from "@/lib/agent-updates";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import {
  cycleViewShortSuffix,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const params = await searchParams;
  const cycleView = parseCycleView(params.view);
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: params.days,
    from: params.from,
    to: params.to,
  });
  const now = new Date();
  const subscriptions = await listSubscriptions(orgId);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);
  const periodSuffix = cycleViewShortSuffix(cycleView, rollingPeriod);

  const [data, roster, planUsage, updateCoverage] = await Promise.all([
    getDashboardDevices(orgId).catch(() => ({
      devices: [] as Awaited<ReturnType<typeof getDashboardDevices>>["devices"],
    })),
    getDeveloperRoster(orgId, { reportWindow }),
    getPlanUsage(
      {
        orgId,
        actorId: userId,
        roles: [role],
        now,
        timezone: UTC_TIMEZONE,
      },
      { reportWindow },
    ),
    getAgentUpdateCoverage(orgId).catch(() => null),
  ]);
  const initial = serializeBigInts({
    developers: roster.developers,
    subscriptions,
    planUsage: planUsage.data.developers,
  }) as unknown as {
    developers: Parameters<typeof DeveloperToolInventory>[0]["initialDevelopers"];
    subscriptions: Parameters<typeof DeveloperToolInventory>[0]["initialSubscriptions"];
    planUsage: Parameters<typeof DeveloperToolInventory>[0]["initialPlanUsage"];
  };
  const empty = data.devices.length === 0;

  return (
    <>
      <PageHeader
        title="Team"
        description={
          empty
            ? "Share an invite link (or email it). Teammates open it, sign up or sign in, and install the agent."
            : "Manage workspace members, plans, devices, and usage."
        }
        actions={<InvitePeopleDialog />}
      />

      {empty ? (
        <div className="mb-10 flex flex-col gap-3 bg-brand-yellow-pale p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="inline-flex w-fit items-center bg-brand-yellow px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-yellow-dark">
              Insight
            </span>
            <p className="max-w-2xl text-sm leading-6 text-foreground">
              One link for the team. Paste it in Slack — anyone with the invite can join and install the agent.
            </p>
          </div>
        </div>
      ) : null}

      <DeveloperToolInventory
        showSummary={false}
        initialDevelopers={initial.developers}
        initialSubscriptions={initial.subscriptions}
        initialPlanUsage={initial.planUsage}
        periodSuffix={periodSuffix}
      />

      {updateCoverage ? <AgentUpdateCoverage coverage={updateCoverage} /> : null}
    </>
  );
}
