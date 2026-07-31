"use client";

import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsPolicyCard } from "@/components/signals/signals-policy-card";
import type { getOrgSignalsPolicy } from "@/lib/signals/service";
import { useAppPageQuery } from "@/lib/api/client";
import { signalsSettingsKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton, isBlockingAppQueryError, useAppQueryErrorToast } from "@/components/app-data-state";

type SignalsSettingsPayload = { policy: Awaited<ReturnType<typeof getOrgSignalsPolicy>> };

export default function SignalsSettingsClientScreen() {
  const query = useAppPageQuery<SignalsSettingsPayload>(signalsSettingsKey, "/api/app/signals/settings");
  useAppQueryErrorToast(query.error && query.data ? query.error : null, { retry: () => void query.refetch() });

  if (query.isPending && !query.data) return <AppPageSkeleton />;
  if (isBlockingAppQueryError(query.error, Boolean(query.data))) {
    return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  }
  if (!query.data) return <AppPageSkeleton />;

  return (
    <>
      <SignalsPageHeader
        title="Boundaries"
        description="Retention for coding-tool work from enrolled agents."
      />
      <SignalsPolicyCard initialPolicy={query.data.policy} />
    </>
  );
}
