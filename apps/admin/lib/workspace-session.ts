import { updateSession } from "@/auth";
import { prisma } from "@usejunction/db";

export type SyncSessionWorkspaceResult =
  | {
      ok: true;
      orgId: string;
      role: string;
      name: string;
    }
  | {
      ok: false;
      error: string;
      status: 403 | 500;
    };

/**
 * Validates membership and writes orgId into the Auth.js JWT.
 * Callers should clear ACTIVE_ORG_COOKIE on the response when ok.
 */
export async function syncSessionWorkspace(
  userId: string,
  orgId: string,
): Promise<SyncSessionWorkspaceResult> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { orgId: true, role: true, organization: { select: { name: true } } },
  });
  if (!membership) {
    return { ok: false, error: "not a member of that workspace", status: 403 };
  }

  const updated = await updateSession({ user: { orgId: membership.orgId } });
  if (updated?.user?.orgId !== membership.orgId) {
    return { ok: false, error: "session update failed", status: 500 };
  }

  return {
    ok: true,
    orgId: membership.orgId,
    role: membership.role,
    name: membership.organization.name,
  };
}
