import type { Metadata } from "next";
import { AppQueryHydration } from "@/components/app-query-hydration";
import { WorkspaceClientLayout } from "@/components/workspace-client-layout";
import { loadWorkspaceContextForSession } from "@/lib/app-pages/workspace-context";
import { makeServerQueryClient } from "@/lib/app-pages/server-query-client";
import { workspaceContextKey } from "@/lib/app-pages/query-keys";
import { requireCompletedOnboarding } from "@/lib/workspace-context";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();

  const queryClient = makeServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: workspaceContextKey,
    queryFn: async () => {
      const data = await loadWorkspaceContextForSession();
      if (!data) throw new Error("UNAUTHENTICATED");
      return data;
    },
  });

  return (
    <AppQueryHydration client={queryClient}>
      <WorkspaceClientLayout>{children}</WorkspaceClientLayout>
    </AppQueryHydration>
  );
}
