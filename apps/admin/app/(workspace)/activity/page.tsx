import { AppQueryHydration } from "@/components/app-query-hydration";
import ActivityClientScreen from "@/components/activity/activity-client-screen";
import { loadActivityPage } from "@/lib/app-pages/activity";
import { loadActivityReportsPage } from "@/lib/app-pages/activity-reports";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { activityKey, activityReportsInlineKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { parseAudienceScope } from "@/lib/audience-scope";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const queryString = searchParamsToQueryString(raw);
  const principal = await principalFromWorkspace();
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const audience =
    principal.role === "user" ? ("you" as const) : parseAudienceScope(flat.scope ?? null);

  const queryClient = makeServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: activityKey(queryString),
      queryFn: () =>
        loadActivityPage(principal, {
          view: flat.view,
          days: flat.days,
          from: flat.from,
          to: flat.to,
          scope: flat.scope,
        }),
    }),
    queryClient.prefetchQuery({
      queryKey: activityReportsInlineKey(audience),
      queryFn: () =>
        loadActivityReportsPage(principal, {
          scope: canSwitchAudience ? audience : undefined,
          limit: "5",
          offset: "0",
          kind: "all",
        }),
    }),
  ]);

  return (
    <AppQueryHydration client={queryClient}>
      <ActivityClientScreen />
    </AppQueryHydration>
  );
}
