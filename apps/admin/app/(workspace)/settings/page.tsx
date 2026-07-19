import { prisma } from "@usejunction/db";
import { ActivitySettingsCard } from "@/components/activity/activity-settings-card";
import { PageHeader } from "@/components/page-header";
import { BillingSettingsCard } from "@/components/settings/billing-settings-card";
import { SignalsSettingsCard } from "@/components/settings/signals-settings-card";
import { WorkspaceSettingsCard } from "@/components/settings/workspace-settings-card";
import { getWorkExtractionReadiness } from "@/lib/agent-updates";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { getOrgBillingStatus } from "@/lib/saas-billing/status";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

export default async function SettingsPage() {
  const { orgId, orgName, organizations, role } = await requireWorkspaceRole(
    rolesFor("settings_billing"),
  );
  const current = organizations.find((org) => org.id === orgId);
  const [settings, signalsPolicy, billing, billingMembers] = await Promise.all([
    getOrgActivitySettings(orgId),
    getOrgSignalsPolicy(orgId),
    getOrgBillingStatus(orgId, role),
    prisma.developer.findMany({
      where: { orgId, removedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);
  const readiness = signalsPolicy.workExtractionEnabled
    ? await getWorkExtractionReadiness(orgId)
    : null;

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
          initialName={orgName ?? current?.name ?? "Workspace"}
          initialColor={current?.color ?? null}
        />
        <BillingSettingsCard billing={billing} members={billingMembers} />
        <SignalsSettingsCard initialPolicy={signalsPolicy} initialReadiness={readiness} />
        <ActivitySettingsCard initialSettings={settings} />
      </div>
    </div>
  );
}
