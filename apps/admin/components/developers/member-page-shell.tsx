import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppQueryHydration } from "@/components/app-query-hydration";
import { MemberClientLayout } from "@/components/developers/member-client-layout";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { teamMemberKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadTeamMemberPage } from "@/lib/app-pages/team-member";

type MemberSection = "overview" | "coding" | "fleet" | "work";

/**
 * Prefetch member hub data for the active section, then hydrate the shared
 * MemberClientLayout query cache. Used by each member page because the layout
 * cannot know which nested section is active.
 */
export async function MemberPageShell({
  developerId,
  section,
  searchParams,
  children,
}: {
  developerId: string;
  section: MemberSection;
  searchParams: Record<string, string | string[] | undefined>;
  children: ReactNode;
}) {
  const flat = flattenSearchParams(searchParams);
  const periodQuery = searchParamsToQueryString(searchParams);
  const principal = await principalFromWorkspace(["owner", "admin"]);
  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: teamMemberKey(developerId, section, periodQuery),
    queryFn: async () => {
      const data = await loadTeamMemberPage(principal, developerId, {
        section,
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
      });
      if (!data) notFound();
      return data;
    },
  });

  return (
    <AppQueryHydration client={queryClient}>
      <MemberClientLayout>{children}</MemberClientLayout>
    </AppQueryHydration>
  );
}
