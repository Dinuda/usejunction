import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import { InvitePeopleDialog } from "@/components/team/team-connect-panel";
import { AgentUpdateCoverage } from "@/components/team/agent-update-coverage";
import { Button } from "@/components/ui/button";
import { isDeviceOnline } from "@/lib/devices/presence";
import { getAgentUpdateCoverage } from "@/lib/agent-updates";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { getDeveloperRoster } from "@/lib/read-models/developers";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default async function TeamPage() {
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const reportWindow = resolveReportWindow({ range: 30 });
  const [data, roster, subscriptions, planUsage, signalsPolicy, updateCoverage] = await Promise.all([
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
  const onlineMachines = initial.developers.reduce(
    (sum, developer) =>
      sum +
      developer.devices.filter((device) => {
        if (device.lastSeenAt) return isDeviceOnline(device.lastSeenAt);
        return device.status === "online";
      }).length,
    0,
  );
  const requests7d = initial.developers.reduce((sum, developer) => sum + developer.requests7d, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">Team</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {empty
              ? "Share an invite link (or email it). Teammates open it, sign up or sign in, and install the agent."
              : "Manage workspace members, plans, machines, and usage."}
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

      <div className="mb-8 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-l-2 border-border-strong pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Members</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{initial.developers.length}</p>
        </div>
        <div className="border-l-2 border-border-strong pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Online machines</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {onlineMachines}/{data.devices.length}
          </p>
        </div>
        <div className="border-l-2 border-border-strong pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Requests</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{compact(requests7d)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last 7 days</p>
        </div>
        <div className="border-l-2 border-primary/50 pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Signals</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{signalsPolicy.enabled ? "On" : "Off"}</p>
          <Button asChild variant="outline" size="sm" className="mt-3 rounded-none">
            <Link href="/signals/settings">
              Manage policy
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <DeveloperToolInventory
        showSummary={false}
        initialDevelopers={initial.developers}
        initialSubscriptions={initial.subscriptions}
        initialPlanUsage={initial.planUsage}
      />

      {updateCoverage ? <AgentUpdateCoverage coverage={updateCoverage} /> : null}
    </div>
  );
}
