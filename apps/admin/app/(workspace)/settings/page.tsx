import { ActivitySettingsCard } from "@/components/activity/activity-settings-card";
import { SignalsSettingsCard } from "@/components/settings/signals-settings-card";
import { WorkspaceSettingsCard } from "@/components/settings/workspace-settings-card";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function SettingsPage() {
  const { orgId, orgName, organizations } = await requireWorkspaceRole(["owner", "admin"]);
  const current = organizations.find((org) => org.id === orgId);
  const [settings, signalsPolicy] = await Promise.all([
    getOrgActivitySettings(orgId),
    getOrgSignalsPolicy(orgId),
  ]);

  return (
    <>
      <header className="mb-10 space-y-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">Settings.</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Workspace identity, Signals collection, and what Activity shows to your team.
          </p>
        </div>
      </header>

      <div className="space-y-6">
        <WorkspaceSettingsCard
          orgId={orgId}
          initialName={orgName ?? current?.name ?? "Workspace"}
          initialColor={current?.color ?? null}
        />
        <SignalsSettingsCard initialPolicy={signalsPolicy} />
        <ActivitySettingsCard initialSettings={settings} />
      </div>
    </>
  );
}
