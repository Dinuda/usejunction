import { AppQueryHydration } from "@/components/app-query-hydration";
import ToolsClientScreen from "@/components/tools/tools-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { toolsKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadToolsPage } from "@/lib/app-pages/tools";

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const queryString = searchParamsToQueryString(raw);
  const principal = await principalFromWorkspace();
  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: toolsKey(queryString),
    queryFn: () =>
      loadToolsPage(principal, {
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
      }),
  });
  return (
    <AppQueryHydration client={queryClient}>
      <ToolsClientScreen />
    </AppQueryHydration>
  );
}
