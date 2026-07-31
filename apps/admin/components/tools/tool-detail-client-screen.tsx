"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { ConnectionRepairBanner } from "@/components/dashboard/connection-repair-banner";
import { ToolProviderDetail } from "@/components/tools/tool-provider-detail";
import {
  cycleViewPeriodLabel,
  cycleViewShortSuffix,
  type CycleView,
  type CycleViewWindows,
} from "@/lib/dashboard/cycle-view";
import type { RollingPeriod } from "@/lib/dashboard/period-prefs";
import type { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import type { RemoteSyncPanelContext } from "@/lib/sync/remote-sync-context";
import { useAppPageQuery } from "@/lib/api/client";
import { toolDetailKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton, isBlockingAppQueryError, useAppQueryErrorToast } from "@/components/app-data-state";

type ToolPayload = {
  kind?: "organization" | "personal";
  rawToolKey: string;
  toolKey: string;
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
  cycleWindows?: CycleViewWindows;
  detail: NonNullable<Awaited<ReturnType<typeof getToolDetail>>> & {
    plans: Array<
      NonNullable<Awaited<ReturnType<typeof getToolDetail>>>["plans"][number] & {
        cycleSeatMicros: string;
        estimatedCycleMicros: string;
      }
    >;
  };
  syncContext: RemoteSyncPanelContext | null;
};

export default function ToolDetailClientScreen() {
  const routeParams = useParams<{ toolKey: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawToolKey = routeParams.toolKey;
  const queryString = searchParams.toString();
  const query = useAppPageQuery<ToolPayload>(
    toolDetailKey(rawToolKey, queryString),
    `/api/app/tools/${encodeURIComponent(rawToolKey)}${queryString ? `?${queryString}` : ""}`,
  );

  useEffect(() => {
    if (query.data && query.data.toolKey !== rawToolKey) {
      router.replace(`/tools/${query.data.toolKey}${queryString ? `?${queryString}` : ""}`);
    }
  }, [query.data, queryString, rawToolKey, router]);

  useAppQueryErrorToast(query.error && query.data ? query.error : null, { retry: () => void query.refetch() });

  if (query.isPending && !query.data) return <AppPageSkeleton />;
  if (isBlockingAppQueryError(query.error, Boolean(query.data))) {
    return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  }
  if (!query.data) return <AppPageSkeleton />;
  const { kind, toolKey, cycleView, rollingPeriod, cycleWindows, detail: serialized, syncContext } = query.data;
  const scope = kind === "personal" ? "self" : "org";

  return (
    <>
      {syncContext?.deviceCount ? (
        <>
          <ConnectionRepairBanner
            scope={kind === "personal" ? "you" : "team"}
            recoveryDevices={syncContext.recoveryDevices}
          />
          <div className="mb-8">
            <LocalSyncPanel
              scope={kind === "personal" ? "you" : "team"}
              lastSeenAt={syncContext.lastSeenAt}
              lastUsageSyncAt={syncContext.lastUsageSyncAt}
              lastAccountSyncAt={syncContext.lastAccountSyncAt}
              dashboardReady={syncContext.dashboardReady}
              dirtyDayCount={syncContext.dirtyDayCount}
              staleDeviceCount={syncContext.staleDeviceCount}
            />
          </div>
        </>
      ) : null}
      <ToolProviderDetail
        data={serialized}
        scope={scope}
        cycleView={cycleView}
        period={rollingPeriod}
        periodLabel={cycleViewPeriodLabel(cycleView, rollingPeriod)}
        periodSuffix={cycleViewShortSuffix(cycleView, rollingPeriod)}
        periodBasePath={`/tools/${toolKey}`}
        cycleWindows={cycleWindows}
      />
    </>
  );
}
