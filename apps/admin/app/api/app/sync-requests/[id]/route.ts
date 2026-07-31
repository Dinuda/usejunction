import { NextRequest } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { getRemoteSyncRequest } from "@/lib/sync/remote-sync";
import { rolesFor } from "@/lib/rbac/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await requireAppPrincipal(request, rolesFor("self_view"));
  if (principal instanceof Response) return principal;
  const { id } = await params;
  const syncRequest = await getRemoteSyncRequest(principal, id);
  if (!syncRequest) {
    return appError("NOT_FOUND", "Sync request not found.", 404);
  }
  return appData(syncRequest);
}
