import { AppQueryHydration } from "@/components/app-query-hydration";
import DashboardClientScreen from "@/components/dashboard/dashboard-client-screen";
import { loadDashboardPage } from "@/lib/app-pages/dashboard";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { dashboardKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";

export default async function DashboardPage({
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
    queryKey: dashboardKey(queryString),
    queryFn: () =>
      loadDashboardPage(principal, {
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
        scope: flat.scope,
      }),
  });
  return (
    <AppQueryHydration client={queryClient}>
      <DashboardClientScreen />
    </AppQueryHydration>
  );
}
