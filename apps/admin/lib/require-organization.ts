import { cookies } from "next/headers";
import { prisma } from "@usejunction/db";
import { requireWorkspaceContext } from "@/lib/workspace-context";

export const ACTIVE_ORG_COOKIE = "uj_active_org";

export function activeOrgCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export async function resolveOrgId(userId: string, sessionOrgId: string | null | undefined) {
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (cookieOrgId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId, orgId: cookieOrgId } },
      select: { orgId: true },
    });
    if (membership) return membership.orgId;
  }

  if (sessionOrgId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId, orgId: sessionOrgId } },
      select: { orgId: true },
    });
    if (membership) return membership.orgId;
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return membership?.orgId ?? null;
}

export async function requireOrganization() {
  const ctx = await requireWorkspaceContext();
  return {
    userId: ctx.userId,
    email: ctx.email,
    orgId: ctx.orgId,
    role: ctx.role,
  };
}
