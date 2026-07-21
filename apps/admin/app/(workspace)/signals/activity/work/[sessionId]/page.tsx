"use client";

import { useParams, useSearchParams } from "next/navigation";
import { WorkSessionDetailView } from "@/components/signals/work-session-detail-view";
import type { getWorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";
import { useAppQuery } from "@/lib/api/client";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type WorkDetailPayload = { session: NonNullable<Awaited<ReturnType<typeof getWorkSessionDetail>>>["data"] };

export default function WorkSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const query = useAppQuery<WorkDetailPayload>(["app", "signals", "work", sessionId], `/api/app/signals/activity/work/${encodeURIComponent(sessionId)}`);
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const session = query.data.session;
  const fromDeveloper = searchParams.get("from") === "team";
  const backHref = fromDeveloper
    ? `/team/${session.developer.id}/work`
    : "/signals/activity";
  const backLabel = fromDeveloper ? session.developer.name : "Activity";

  return (
    <WorkSessionDetailView
      session={session}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
