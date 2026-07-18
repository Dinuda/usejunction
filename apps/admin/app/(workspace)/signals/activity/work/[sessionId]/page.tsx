import { notFound } from "next/navigation";
import { WorkSessionDetailView } from "@/components/signals/work-session-detail-view";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getWorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

export default async function WorkSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const { sessionId } = await params;
  const query = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(rolesFor("org_overview"));

  const envelope = await getWorkSessionDetail(
    { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
    sessionId,
  );
  if (!envelope) notFound();

  const fromDeveloper = query.from === "team";
  const backHref = fromDeveloper
    ? `/team/${envelope.data.developer.id}/work`
    : "/signals/activity";
  const backLabel = fromDeveloper ? envelope.data.developer.name : "Activity";

  return (
    <WorkSessionDetailView
      session={envelope.data}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
