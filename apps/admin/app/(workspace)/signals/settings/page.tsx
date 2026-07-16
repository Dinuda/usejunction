import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsPolicyCard } from "@/components/signals/signals-policy-card";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function SignalsSettingsPage() {
  const { orgId } = await requireWorkspaceRole(["owner", "admin"]);
  const signalsPolicy = await getOrgSignalsPolicy(orgId);

  return (
    <>
      <SignalsPageHeader
        title="Boundaries"
        description="Observes the journey into and out of AI — not the work itself."
      />
      <SignalsPolicyCard initialPolicy={signalsPolicy} />
    </>
  );
}
