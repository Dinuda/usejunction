"use client";

import { ActivitySettingsCard } from "@/components/activity/activity-settings-card";
import { PageHeader } from "@/components/page-header";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { EmailReportsSettingsCard, type EmailReportsPrefs } from "@/components/settings/email-reports-settings-card";
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
  const prefsQuery = useAppQuery<EmailReportsPrefs>(
    ["app", "notification-preferences"],
    "/api/app/me/notification-preferences",
  );
  const canManageOrg =
    prefsQuery.data?.role === "owner" || prefsQuery.data?.role === "admin";
  const orgQuery = useAppQuery<SettingsPayload>(
    ["app", "settings"],
    "/api/app/settings",
    { enabled: canManageOrg },
  );

  if (prefsQuery.isPending || (canManageOrg && orgQuery.isPending)) return <AppPageSkeleton />;
  if (prefsQuery.error) {
    return <AppPageError error={prefsQuery.error} retry={() => void prefsQuery.refetch()} />;
  }
  if (canManageOrg && orgQuery.error) {
    return <AppPageError error={orgQuery.error} retry={() => void orgQuery.refetch()} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Settings."
        description="Email reports, workspace identity, billing, and what Activity shows to your team."
        className="mb-8"
      />

      <div className="space-y-6">
        {prefsQuery.data ? <EmailReportsSettingsCard initial={prefsQuery.data} /> : null}
        {canManageOrg && orgQuery.data ? (
          <>
            <WorkspaceSettingsCard
              orgId={orgQuery.data.orgId}
              initialName={orgQuery.data.orgName}
              initialColor={orgQuery.data.orgColor}
            />
            <BillingSettingsCard billing={orgQuery.data.billing} members={orgQuery.data.billingMembers} />
            <SignalsSettingsCard initialPolicy={orgQuery.data.signalsPolicy} />
            <ActivitySettingsCard initialSettings={orgQuery.data.settings} />
          </>
        ) : null}
      </div>
    </div>
  );
}
