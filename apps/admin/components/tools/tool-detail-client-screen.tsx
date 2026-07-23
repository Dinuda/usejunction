"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { ToolProviderDetail } from "@/components/tools/tool-provider-detail";
import {
  cycleViewPeriodLabel,
  cycleViewShortSuffix,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import type { RollingPeriod } from "@/lib/dashboard/period-prefs";
import type { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import type { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { useAppQuery } from "@/lib/api/client";
import { toolDetailKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type ToolPayload = {
  rawToolKey: string;
  toolKey: string;
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
  detail: NonNullable<Awaited<ReturnType<typeof getToolDetail>>> & {
    plans: Array<
      NonNullable<Awaited<ReturnType<typeof getToolDetail>>>["plans"][number] & {
        cycleSeatMicros: string;
        estimatedCycleMicros: string;
      }
    >;
  };
  syncContext: Awaited<ReturnType<typeof getLocalSyncContext>>;
};

export default function ToolDetailClientScreen() {
  const routeParams = useParams<{ toolKey: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawToolKey = routeParams.toolKey;
  const queryString = searchParams.toString();
  const query = useAppQuery<ToolPayload>(
    toolDetailKey(rawToolKey, queryString),
    `/api/app/tools/${encodeURIComponent(rawToolKey)}${queryString ? `?${queryString}` : ""}`,
  );

  useEffect(() => {
    if (query.data && query.data.toolKey !== rawToolKey) {
      router.replace(`/tools/${query.data.toolKey}${queryString ? `?${queryString}` : ""}`);
    }
  }, [query.data, queryString, rawToolKey, router]);

  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const { toolKey, cycleView, rollingPeriod, detail: serialized, syncContext } = query.data;

  return (
    <>
      {syncContext?.hasLocalEndpoint ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
          />
        </div>
      ) : null}
      <ToolProviderDetail
        data={serialized}
        cycleView={cycleView}
        period={rollingPeriod}
        periodLabel={cycleViewPeriodLabel(cycleView, rollingPeriod)}
        periodSuffix={cycleViewShortSuffix(cycleView, rollingPeriod)}
        periodBasePath={`/tools/${toolKey}`}
      />
    </>
  );
}
