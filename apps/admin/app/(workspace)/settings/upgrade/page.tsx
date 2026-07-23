import { redirect } from "next/navigation";
import { TeamUpgradeCheckout } from "@/components/settings/team-upgrade-checkout";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { loadOrgSettingsPage } from "@/lib/app-pages/settings";
import { rolesFor } from "@/lib/rbac";

export default async function TeamUpgradePage() {
  const principal = await principalFromWorkspace(rolesFor("settings_billing"));
  const orgSettings = await loadOrgSettingsPage(principal);

  if (!orgSettings?.billing.canUpgrade) {
    redirect("/settings#settings-billing");
  }

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <TeamUpgradeCheckout
        billing={orgSettings.billing}
        members={orgSettings.billingMembers}
        email={principal.email}
        name={principal.name}
      />
    </div>
  );
}
