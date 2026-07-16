import { notFound } from "next/navigation";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { ToolProviderDetail } from "@/components/tools/tool-provider-detail";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";
import { getLocalSyncContext } from "@/lib/queries/me/local-sync-context";
import { serializeBigInts } from "@/lib/billing/validation";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function ToolProviderPage({
  params,
}: {
  params: Promise<{ toolKey: string }>;
}) {
  const { orgId, userId } = await requireWorkspaceRole(["owner", "admin"]);
  const { toolKey } = await params;
  const [detail, syncContext] = await Promise.all([
    getToolDetail(orgId, toolKey),
    getLocalSyncContext(orgId, userId),
  ]);
  if (!detail) notFound();

  const serialized = serializeBigInts(detail) as typeof detail & {
    plans: Array<
      (typeof detail.plans)[number] & {
        cycleSeatMicros: string;
        estimatedCycleMicros: string;
      }
    >;
  };

  return (
    <>
      {syncContext?.hasLocalEndpoint ? (
        <div className="mb-8">
          <LocalSyncPanel
            lastSeenAt={syncContext.lastSeenAt}
            lastUsageSyncAt={syncContext.lastUsageSyncAt}
            lastAccountSyncAt={syncContext.lastAccountSyncAt}
            stale={syncContext.stale}
          />
        </div>
      ) : null}
      <ToolProviderDetail data={serialized} />
    </>
  );
}
