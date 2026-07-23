import { AppQueryHydration } from "@/components/app-query-hydration";
import TeamClientScreen from "@/components/team/team-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { teamKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadTeamPage } from "@/lib/app-pages/team";

export default async function TeamPage({
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
    queryKey: teamKey(queryString),
    queryFn: () =>
      loadTeamPage(principal, {
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
      }),
  });
  return (
    <AppQueryHydration client={queryClient}>
      <TeamClientScreen />
    </AppQueryHydration>
  );
}
