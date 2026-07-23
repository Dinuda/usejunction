import { AppQueryHydration } from "@/components/app-query-hydration";
import SettingsClientScreen from "@/components/settings/settings-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { notificationPreferencesKey, settingsKey } from "@/lib/app-pages/query-keys";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadSettingsPage } from "@/lib/app-pages/settings";

export default async function SettingsPage() {
  const principal = await principalFromWorkspace();
  const queryClient = makeServerQueryClient();
  const { prefs, orgSettings } = await loadSettingsPage(principal);

  queryClient.setQueryData(notificationPreferencesKey, prefs);
  if (orgSettings) {
    queryClient.setQueryData(settingsKey, orgSettings);
  }

  return (
    <AppQueryHydration client={queryClient}>
      <SettingsClientScreen />
    </AppQueryHydration>
  );
}
