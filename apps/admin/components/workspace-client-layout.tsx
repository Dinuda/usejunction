"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";
import { TimezoneReporter } from "@/components/timezone-reporter";
import { useAppQuery } from "@/lib/api/client";
import { workspaceContextKey } from "@/lib/app-pages/query-keys";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import type { OrganizationRole } from "@/lib/rbac/permissions";

type WorkspaceSyncState = {
  deviceCount: number;
  toolCount: number;
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  watermark: string;
};

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
  sync?: WorkspaceSyncState;
  sessionWorkspaceSyncRequired: boolean;
};

function WorkspaceClientLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const queryString = useSearchParams().toString();
  const awaitingFirstUsage = useRef(false);
  const awaitingSince = useRef<number | null>(null);
  const lastWatermark = useRef<string | null>(null);
  const contextQuery = useAppQuery<WorkspaceContext>(
    workspaceContextKey,
    "/api/app/workspace-context",
    {
      // Poll while a device is connected but usage has not landed yet so Team /
      // Tools / Activity do not keep empty responses after the first agent sync.
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data?.current?.onboardingCompleted) return false;
        const syncState = data.sync;
        if (!syncState) return false;
        const waiting =
          (syncState.deviceCount > 0 && !syncState.lastUsageSyncAt) || awaitingFirstUsage.current;
        if (!waiting) return false;
        if (awaitingSince.current && Date.now() - awaitingSince.current > 3 * 60_000) return false;
        return 5_000;
      },
    },
  );
  const syncStarted = useRef(false);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;
    queryClient.clear();
    const from = `${pathname}${queryString ? `?${queryString}` : ""}`;
    router.replace(`/login?from=${encodeURIComponent(from)}`);
  }, [pathname, queryClient, queryString, router, sessionStatus]);

  useEffect(() => {
    if (!contextQuery.data) return;
    if (!contextQuery.data.current || !contextQuery.data.current.onboardingCompleted) {
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

  useEffect(() => {
    const syncState = contextQuery.data?.sync;
    if (!syncState) return;

    if (syncState.deviceCount > 0 && !syncState.lastUsageSyncAt) {
      awaitingFirstUsage.current = true;
      if (awaitingSince.current === null) awaitingSince.current = Date.now();
    } else if (syncState.lastUsageSyncAt) {
      awaitingFirstUsage.current = false;
      awaitingSince.current = null;
    }

    if (lastWatermark.current === null) {
      lastWatermark.current = syncState.watermark;
      return;
    }
    if (lastWatermark.current === syncState.watermark) return;
    lastWatermark.current = syncState.watermark;
    // Agent ingest advanced — drop stale Team/Tools/Activity empties.
    void queryClient.invalidateQueries({ queryKey: ["app"] });
  }, [contextQuery.data?.sync, queryClient]);

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
      <TimezoneReporter />
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
