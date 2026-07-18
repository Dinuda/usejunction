import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsPolicyCard } from "@/components/signals/signals-policy-card";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

export default async function SignalsSettingsPage() {
  const { orgId } = await requireWorkspaceRole(rolesFor("settings_billing"));
  const signalsPolicy = await getOrgSignalsPolicy(orgId);

  return (
    <>
      <SignalsPageHeader
        title="Boundaries"
        description="Retention for coding-tool work from enrolled agents."
      />
      <SignalsPolicyCard initialPolicy={signalsPolicy} />
    </>
  );
}
