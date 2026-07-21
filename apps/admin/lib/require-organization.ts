import { cookies } from "next/headers";
import { prisma } from "@usejunction/db";

// Compatibility only. New workspace selections live in the Auth.js JWT.
// Remove this fallback after 2026-08-20, once active browser sessions have
// completed the POST-based migration in WorkspaceClientLayout.
export const ACTIVE_ORG_COOKIE = "uj_active_org";

export async function resolveOrgId(userId: string, sessionOrgId: string | null | undefined) {
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const candidateOrgId = cookieOrgId ?? sessionOrgId;
  if (candidateOrgId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId, orgId: candidateOrgId } },
      select: { orgId: true },
    });
    if (membership) return membership.orgId;
  }

  const fallback = await prisma.organizationMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { orgId: true },
  });
  return fallback?.orgId ?? null;
}
