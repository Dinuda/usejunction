import { notFound, redirect } from "next/navigation";
import { AppQueryHydration } from "@/components/app-query-hydration";
import ToolDetailClientScreen from "@/components/tools/tool-detail-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { toolDetailKey } from "@/lib/app-pages/query-keys";
import { flattenSearchParams, searchParamsToQueryString } from "@/lib/app-pages/search-params";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadToolDetailPage, resolveToolDetailAccess } from "@/lib/app-pages/tool-detail";

export default async function ToolProviderPage({
  params,
  searchParams,
}: {
  params: Promise<{ toolKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { toolKey: rawToolKey } = await params;
  const raw = await searchParams;
  const flat = flattenSearchParams(raw);
  const queryString = searchParamsToQueryString(raw);
  const principal = await principalFromWorkspace();
  const access = await resolveToolDetailAccess(principal);
  if (!access.ok) redirect("/dashboard");

  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: toolDetailKey(rawToolKey, queryString),
    queryFn: async () => {
      const data = await loadToolDetailPage(principal, rawToolKey, {
        view: flat.view,
        days: flat.days,
        from: flat.from,
        to: flat.to,
      });
      if (!data || "error" in data) notFound();
      return data;
    },
  });
  return (
    <AppQueryHydration client={queryClient}>
      <ToolDetailClientScreen />
    </AppQueryHydration>
  );
}
