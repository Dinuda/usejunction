import { AppQueryHydration } from "@/components/app-query-hydration";
import SignalsOverviewClientScreen from "@/components/signals/signals-overview-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { signalsOverviewKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadSignalsOverviewPage } from "@/lib/app-pages/signals-overview";

export default async function SignalsOverviewPage({
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
    queryKey: signalsOverviewKey(queryString),
    queryFn: () =>
      loadSignalsOverviewPage(principal, {
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
      <SignalsOverviewClientScreen />
    </AppQueryHydration>
  );
}
