import { NextRequest } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { reconcileDeviceHealth } from "@/lib/sync/remote-sync";
import { resolveLinkedDeveloper, type SyncRequestScope } from "@/lib/sync/remote-sync-context";
import { hasCapability } from "@/lib/rbac/permissions";
import { browserMutationGuard, limitedJson } from "@/lib/security/http";

function parseScope(value: unknown): SyncRequestScope | null {
  return value === "team" || value === "you" ? value : null;
}

export async function POST(request: NextRequest) {
  const rejected = browserMutationGuard(request);
  if (rejected) return rejected;
  const principal = await requireAppPrincipal(request);
  if (principal instanceof Response) return principal;

  const parsed = await limitedJson(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const scope = parseScope((parsed.data as Record<string, unknown>).scope);
  if (!scope) return appError("INVALID_SCOPE", "Health scope must be team or you.", 400);
  if (scope === "team" && !hasCapability(principal.role, "org_overview")) {
    return appError("FORBIDDEN", "You do not have access to team health.", 403);
  }

  const developer = scope === "you" ? await resolveLinkedDeveloper(principal.orgId, principal.userId) : null;
  if (scope === "you" && !developer) return appData({ scanned: 0, stale: 0, autoRequestsCreated: 0, repairRequired: 0, noticesSent: 0, noticesFailed: 0 });

  try {
    return appData(
      await reconcileDeviceHealth({
        orgId: principal.orgId,
        developerId: developer?.id,
        sendNotifications: false,
      }),
    );
  } catch (error) {
    return appError(
      "DEVICE_HEALTH_RECONCILE_FAILED",
      error instanceof Error ? error.message : "Could not reconcile device health.",
      500,
    );
  }
}
