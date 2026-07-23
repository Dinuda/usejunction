import { notFound } from "next/navigation";
import { AppQueryHydration } from "@/components/app-query-hydration";
import SignalsWorkDetailClientScreen from "@/components/signals/signals-work-detail-client-screen";
import { principalFromWorkspace } from "@/lib/app-pages/principal";
import { signalsWorkKey } from "@/lib/app-pages/query-keys";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { loadSignalsWorkDetailPage } from "@/lib/app-pages/signals-work-detail";

export default async function WorkSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const principal = await principalFromWorkspace(["owner", "admin"]);
  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: signalsWorkKey(sessionId),
    queryFn: async () => {
      const data = await loadSignalsWorkDetailPage(principal, sessionId);
      if (!data) notFound();
      return data;
    },
  });
  return (
    <AppQueryHydration client={queryClient}>
      <SignalsWorkDetailClientScreen />
    </AppQueryHydration>
  );
}
