"use client";

import { ActivitySettingsCard } from "@/components/activity/activity-settings-card";
import { PageHeader } from "@/components/page-header";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { SignalsSettingsCard } from "@/components/settings/signals-settings-card";
import { WorkspaceSettingsCard } from "@/components/settings/workspace-settings-card";
import type { getOrgActivitySettings } from "@/lib/activity/service";
import type { getOrgSignalsPolicy } from "@/lib/signals/service";
import type { getOrgBillingStatus } from "@/lib/saas-billing/status";
import { useAppQuery } from "@/lib/api/client";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type SettingsPayload = {
  orgId: string;
  orgName: string;
  orgColor: string | null;
  settings: Awaited<ReturnType<typeof getOrgActivitySettings>>;
  signalsPolicy: Awaited<ReturnType<typeof getOrgSignalsPolicy>>;
  billing: Awaited<ReturnType<typeof getOrgBillingStatus>>;
  billingMembers: Array<{ id: string; name: string; email: string }>;
};

export default function SettingsPage() {
  const query = useAppQuery<SettingsPayload>(["app", "settings"], "/api/app/settings");
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const { orgId, orgName, orgColor, settings, signalsPolicy, billing, billingMembers } = query.data;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Settings."
        description="Workspace identity, billing, Signals collection, and what Activity shows to your team."
        className="mb-8"
      />

      <div className="space-y-6">
        <WorkspaceSettingsCard
          orgId={orgId}
          initialName={orgName}
          initialColor={orgColor}
        />
        <BillingSettingsCard billing={billing} members={billingMembers} />
        <SignalsSettingsCard initialPolicy={signalsPolicy} />
        <ActivitySettingsCard initialSettings={settings} />
      </div>
    </div>
  );
}
