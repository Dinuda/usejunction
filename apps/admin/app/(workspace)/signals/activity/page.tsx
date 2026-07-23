import { AppQueryHydration } from "@/components/app-query-hydration";
import SignalsActivityClientScreen from "@/components/signals/signals-activity-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { signalsActivityKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadSignalsActivityPage } from "@/lib/app-pages/signals-activity";

export default async function SignalsActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const queryString = searchParamsToQueryString(raw);
  const principal = await principalFromWorkspace(["owner", "admin"]);
  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: signalsActivityKey(queryString),
    queryFn: () =>
      loadSignalsActivityPage(principal, {
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
        scope: flat.scope,
        developerId: flat.developerId,
        teamId: flat.teamId,
        tool: flat.tool,
      }),
  });
  return (
    <AppQueryHydration client={queryClient}>
      <SignalsActivityClientScreen />
    </AppQueryHydration>
  );
}
