"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";
import { useAppQuery } from "@/lib/api/client";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import type { OrganizationRole } from "@/lib/rbac/permissions";

type WorkspaceContext = {
  organizations: Array<{ id: string; name: string; color: string | null; role: OrganizationRole }>;
  current: {
    id: string;
    name: string;
    color: string | null;
    role: OrganizationRole;
    onboardingCompleted: boolean;
  } | null;
  billing: OrgBillingStatus | null;
  sessionWorkspaceSyncRequired: boolean;
};

/**
 * Start the active page request as soon as the client layout mounts. The page
 * hook adopts the same cache entry while session identity and workspace
 * context resolve independently.
 */
function activePageData(pathname: string, queryString: string): { queryKey: readonly unknown[]; url: string } | null {
  const suffix = queryString ? `?${queryString}` : "";
  const pages: Record<string, { queryKey: string[]; url: string }> = {
    "/dashboard": { queryKey: ["app", "dashboard"], url: "/api/app/dashboard" },
    "/activity": { queryKey: ["app", "activity"], url: "/api/app/activity" },
    "/tools": { queryKey: ["app", "tools"], url: "/api/app/tools" },
    "/team": { queryKey: ["app", "team"], url: "/api/app/team" },
    "/signals": { queryKey: ["app", "signals", "overview"], url: "/api/app/signals/overview" },
    "/signals/activity": { queryKey: ["app", "signals", "activity"], url: "/api/app/signals/activity" },
  };
  const page = pages[pathname];
  if (page) {
    return { queryKey: [...page.queryKey, queryString], url: `${page.url}${suffix}` };
  }
  if (pathname === "/settings") return { queryKey: ["app", "settings"], url: "/api/app/settings" };
  if (pathname === "/signals/settings") return { queryKey: ["app", "signals", "settings"], url: "/api/app/signals/settings" };
  return null;
}

function WorkspaceClientLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const queryString = useSearchParams().toString();
  const contextQuery = useAppQuery<WorkspaceContext>(
    ["app", "workspace-context"],
    "/api/app/workspace-context",
  );
  const syncStarted = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const pageData = useMemo(() => activePageData(pathname, queryString), [pathname, queryString]);
  // Keep one active observer for page data in the layout. The screen uses the
  // same key, so it adopts this in-flight request instead of racing a second
  // fetch after its client bundle mounts.
  useAppQuery<unknown>(
    pageData?.queryKey ?? ["app", "page-data-idle"],
    pageData?.url ?? "/api/app/workspace-context",
    { enabled: Boolean(pageData) },
  );

  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;
    queryClient.clear();
    const from = `${pathname}${queryString ? `?${queryString}` : ""}`;
    router.replace(`/login?from=${encodeURIComponent(from)}`);
  }, [pathname, queryClient, queryString, router, sessionStatus]);

  useEffect(() => {
    if (contextQuery.data?.current && !contextQuery.data.current.onboardingCompleted) {
      router.replace("/onboarding");
    }
  }, [contextQuery.data, router]);

  useEffect(() => {
    const context = contextQuery.data;
    if (!context?.sessionWorkspaceSyncRequired || !context.current || syncStarted.current) return;
    syncStarted.current = true;
    void fetch("/api/me/workspace", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "usejunction-web",
      },
      body: JSON.stringify({ orgId: context.current.id }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("workspace session sync failed");
      queryClient.clear();
      window.location.reload();
    }).catch(() => {
      syncStarted.current = false;
      setSyncFailed(true);
    });
  }, [contextQuery.data, queryClient]);

  const context = contextQuery.data;
  const current = context?.current ?? null;
  const migrationPending = Boolean(context?.sessionWorkspaceSyncRequired && current && !syncFailed);

  return (
    <WorkspaceShell
      organizations={context?.organizations ?? []}
      currentOrgId={current?.id ?? session?.user?.orgId ?? null}
      role={current?.role ?? null}
      name={session?.user?.name}
      email={session?.user?.email}
      image={session?.user?.image}
      billing={context?.billing ?? null}
    >
      {migrationPending ? <AppPageSkeleton /> : (
        <div className="space-y-4">
          {contextQuery.error ? (
            <AppPageError
              error={contextQuery.error}
              retry={() => {
                setSyncFailed(false);
                void contextQuery.refetch();
              }}
            />
          ) : null}
          {children}
        </div>
      )}
    </WorkspaceShell>
  );
}

export function WorkspaceClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus>
      <WorkspaceClientLayoutInner>{children}</WorkspaceClientLayoutInner>
    </SessionProvider>
  );
}
