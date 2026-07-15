import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import { InvitePeopleDialog } from "@/components/team/team-connect-panel";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function TeamPage() {
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const reportWindow = resolveReportWindow({ range: 30 });
  const [data, roster, subscriptions, planUsage] = await Promise.all([
    getDashboardDevices(orgId).catch(() => ({
      devices: [] as Awaited<ReturnType<typeof getDashboardDevices>>["devices"],
    })),
    getDeveloperRoster(orgId),
    listSubscriptions(orgId),
    getPlanUsage({
      orgId,
      actorId: userId,
      roles: [role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    }, { reportWindow }),
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
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
            {empty ? "Get the first machines reporting." : "Who's on the roster."}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {empty
              ? "Share an invite link (or email it). Teammates open it, sign up or sign in, and install the agent."
              : "Everyone on this workspace. Open a person for plans, machines, and usage."}
          </p>
        </div>
        <InvitePeopleDialog />
      </div>

      {empty ? (
        <div className="mb-10">
          <div className="uj-grid-texture relative overflow-hidden border border-border bg-brand-yellow p-6 text-brand-yellow-dark sm:p-8 [--uj-grid-opacity:0.09]">
            <p className="relative max-w-lg text-2xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-3xl">
              One link for the team. Paste it in Slack.
            </p>
            <p className="relative mt-3 max-w-md text-sm leading-6 text-brand-yellow-dark/80">
              Use Invite teammates above. Copy the link or email instructions — anyone with the link can join and install.
            </p>
          </div>
        </div>
      ) : null}

      <DeveloperToolInventory
        showSummary={false}
        initialDevelopers={initial.developers}
        initialSubscriptions={initial.subscriptions}
        initialPlanUsage={initial.planUsage}
      />
    </>
  );
}
