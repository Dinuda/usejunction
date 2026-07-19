import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import { PageHeader } from "@/components/page-header";
import { InvitePeopleDialog } from "@/components/team/team-connect-panel";
import { AgentUpdateCoverage } from "@/components/team/agent-update-coverage";
import { SignalsKpi } from "@/components/signals/signals-ui";
import { getAgentUpdateCoverage } from "@/lib/agent-updates";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import {
  cycleViewPeriodLabel,
  cycleViewShortSuffix,
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { formatCompactNumber } from "@/lib/format";
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
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);
  const periodSuffix = cycleViewShortSuffix(cycleView, rollingPeriod);

  const [data, roster, planUsage, signalsPolicy, updateCoverage] = await Promise.all([
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
    getOrgSignalsPolicy(orgId),
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
  const requests = initial.developers.reduce((sum, developer) => sum + developer.requests, 0);

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

      <div className="mb-10 grid items-stretch gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Members"
          className="pl-5"
          value={initial.developers.length}
        />
        <SignalsKpi
          label="Enrolled machines"
          className="sm:border-l sm:border-border sm:pl-8"
          value={data.devices.length}
        />
        <SignalsKpi
          label="Requests"
          className="xl:border-l xl:border-border xl:pl-8"
          value={formatCompactNumber(requests)}
          sub={periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
          action={
            <MetricPeriodFilter view={cycleView} period={rollingPeriod} basePath="/team" />
          }
        />
        <SignalsKpi
          label="Signals"
          className="sm:border-l sm:border-border sm:pl-8"
          value={signalsPolicy.enabled ? "On" : "Off"}
          sub={
            <Link
              href="/settings"
              className="inline-flex w-fit items-center gap-0.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Manage policy
              <ArrowUpRight className="size-3" />
            </Link>
          }
        />
      </div>

      <DeveloperToolInventory
        showSummary={false}
        currentUserId={userId}
        initialDevelopers={initial.developers}
        initialSubscriptions={initial.subscriptions}
        initialPlanUsage={initial.planUsage}
        periodSuffix={periodSuffix}
      />

      {updateCoverage ? <AgentUpdateCoverage coverage={updateCoverage} /> : null}
    </>
  );
}
