"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import { HubTabList } from "@/components/hub-nav";
import { PageHeader } from "@/components/page-header";
import { InvitePeopleDialog } from "@/components/team/team-connect-panel";
import { TeamInvitedPanel, type PendingInvite } from "@/components/team/team-invited-panel";
import { TeamSyncsPanel } from "@/components/team/team-syncs-panel";
import { serializeBigInts } from "@/lib/billing/validation";
import {
  cycleViewShortSuffix,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import type { RollingPeriod } from "@/lib/dashboard/period-prefs";
import type { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import type { OrgDeviceSyncStatus } from "@/lib/queries/team/device-syncs";
import type { getDeveloperRoster } from "@/lib/read-models/developers";
import type { listSubscriptions } from "@/lib/tools/subscriptions";
import { useAppPageQuery } from "@/lib/api/client";
import { teamKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type TeamView = "active" | "invited" | "syncs";

const teamViews: { id: TeamView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "invited", label: "Invited" },
  { id: "syncs", label: "Syncs" },
];

type TeamPayload = {
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
  empty: boolean;
  developers: Awaited<ReturnType<typeof getDeveloperRoster>>["developers"];
  subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
  planUsage: Awaited<ReturnType<typeof getPlanUsage>>["data"]["developers"];
  pendingInvites: PendingInvite[];
  syncs: OrgDeviceSyncStatus;
};

export default function TeamClientScreen() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [view, setView] = useState<TeamView>("active");
  const query = useAppPageQuery<TeamPayload>(
    teamKey(queryString),
    `/api/app/team${queryString ? `?${queryString}` : ""}`,
  );
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const {
    cycleView,
    rollingPeriod,
    empty,
    subscriptions,
    pendingInvites = [],
    syncs = { devices: [], totals: { total: 0, online: 0, stale: 0, neverSynced: 0 } },
  } = query.data;
  const periodSuffix = cycleViewShortSuffix(cycleView, rollingPeriod);
  const initial = serializeBigInts({
    developers: query.data.developers,
    subscriptions,
    planUsage: query.data.planUsage,
  }) as unknown as {
    developers: Parameters<typeof DeveloperToolInventory>[0]["initialDevelopers"];
    subscriptions: Parameters<typeof DeveloperToolInventory>[0]["initialSubscriptions"];
    planUsage: Parameters<typeof DeveloperToolInventory>[0]["initialPlanUsage"];
  };

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
      >
        <HubTabList
          items={teamViews}
          value={view}
          onChange={(id) => setView(id as TeamView)}
          className="border-b border-border"
          aria-label="Team views"
        />
      </PageHeader>

      {empty && view === "active" ? (
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

      {view === "active" ? (
        <DeveloperToolInventory
          initialDevelopers={initial.developers}
          initialSubscriptions={initial.subscriptions}
          initialPlanUsage={initial.planUsage}
          periodSuffix={periodSuffix}
        />
      ) : view === "invited" ? (
        <TeamInvitedPanel initialInvites={pendingInvites} />
      ) : (
        <TeamSyncsPanel syncs={syncs} />
      )}
    </>
  );
}
