import type { QueryClient } from "@tanstack/react-query";
import { appFetch } from "@/lib/api/client";
import { dashboardMetricsKey } from "@/lib/app-pages/query-keys";
import { copyAudienceScope } from "@/lib/audience-scope";
import type { CycleView } from "@/lib/dashboard/cycle-view";

/** Warm metrics for an adjacent cycle tab — preserves current audience scope. */
export function prefetchDashboardMetrics(
  queryClient: QueryClient,
  view: Exclude<CycleView, "last_30_days">,
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({ slice: "metrics", view });
  copyAudienceScope(params, window.location.search);
  const queryString = params.toString();
  void queryClient.prefetchQuery({
    queryKey: dashboardMetricsKey(queryString),
    queryFn: () => appFetch(`/api/app/dashboard?${queryString}`),
  });
}
