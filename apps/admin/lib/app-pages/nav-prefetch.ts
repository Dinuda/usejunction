import type { QueryClient } from "@tanstack/react-query";
import { appFetch } from "@/lib/api/client";
import {
  activityKey,
  dashboardShellKey,
  signalsOverviewKey,
  teamKey,
  toolsKey,
} from "@/lib/app-pages/query-keys";

/**
 * Top-level sidebar destinations only — never prefetch inner routes like
 * `/tools/:toolKey` or `/team/:developerId`.
 */
const NAV_PREFETCH_TARGETS: Record<string, { queryKey: readonly unknown[]; url: string }> = {
  "/dashboard": { queryKey: dashboardShellKey, url: "/api/app/dashboard?slice=shell" },
  "/team": { queryKey: teamKey(), url: "/api/app/team" },
  "/tools": { queryKey: toolsKey(), url: "/api/app/tools" },
  "/activity": { queryKey: activityKey(), url: "/api/app/activity" },
  "/signals": { queryKey: signalsOverviewKey(), url: "/api/app/signals/overview" },
};

/** Warm the React Query cache for a primary nav destination on hover/focus. */
export function prefetchNavPage(queryClient: QueryClient, href: string) {
  const target = NAV_PREFETCH_TARGETS[href];
  if (!target) return;
  void queryClient.prefetchQuery({
    queryKey: target.queryKey,
    queryFn: () => appFetch(target.url),
  });
}
