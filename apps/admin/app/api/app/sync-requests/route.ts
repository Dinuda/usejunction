import { NextRequest } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { createRemoteSyncRequest, type SyncRequestScope } from "@/lib/sync/remote-sync";
import { rolesFor } from "@/lib/rbac/permissions";
import { browserMutationGuard, limitedJson } from "@/lib/security/http";

function parseScope(value: unknown): SyncRequestScope | null {
  return value === "team" || value === "you" ? value : null;
}

export async function POST(request: NextRequest) {
  const rejected = browserMutationGuard(request);
  if (rejected) return rejected;
  const principal = await requireAppPrincipal(request, rolesFor("self_view"));
  if (principal instanceof Response) return principal;

  const parsed = await limitedJson(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  const scope = parseScope(body.scope);
  if (!scope) return appError("INVALID_SCOPE", "Sync scope must be team or you.", 400);

  try {
    const requestView = await createRemoteSyncRequest({
      principal,
      scope,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
    });
    return appData(requestView);
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return appError("FORBIDDEN", "You do not have access to request that sync.", 403);
    }
    if (error instanceof Error && error.message === "LINKED_DEVELOPER_REQUIRED") {
      return appError("LINKED_DEVELOPER_REQUIRED", "Link your user to a developer profile before syncing your devices.", 409);
    }
    return appError("SYNC_REQUEST_FAILED", error instanceof Error ? error.message : "Could not request sync.", status);
  }
}
