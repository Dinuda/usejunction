"use client";

import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { SignalsPolicyCard } from "@/components/signals/signals-policy-card";
import type { getOrgSignalsPolicy } from "@/lib/signals/service";
import { useAppQuery } from "@/lib/api/client";
import { signalsSettingsKey } from "@/lib/app-pages/query-keys";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type SignalsSettingsPayload = { policy: Awaited<ReturnType<typeof getOrgSignalsPolicy>> };

export default function SignalsSettingsClientScreen() {
  const query = useAppQuery<SignalsSettingsPayload>(signalsSettingsKey, "/api/app/signals/settings");
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;

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
