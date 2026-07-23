import { AppQueryHydration } from "@/components/app-query-hydration";
import SignalsSettingsClientScreen from "@/components/signals/signals-settings-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { signalsSettingsKey } from "@/lib/app-pages/query-keys";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadSignalsSettingsPage } from "@/lib/app-pages/signals-settings";

export default async function SignalsSettingsPage() {
  const principal = await principalFromWorkspace(["owner", "admin"]);
  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: signalsSettingsKey,
    queryFn: () => loadSignalsSettingsPage(principal),
  });
  return (
    <AppQueryHydration client={queryClient}>
      <SignalsSettingsClientScreen />
    </AppQueryHydration>
  );
}
