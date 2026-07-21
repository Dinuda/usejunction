import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import type { OrganizationRole } from "@/lib/rbac/permissions";

export type { OrganizationRole };

export type WorkspaceContext = {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  orgId: string | null;
  orgName: string | null;
  role: OrganizationRole | null;
  onboardingCompletedAt: Date | null;
  organizations: Array<{ id: string; name: string; color: string | null; role: OrganizationRole }>;
};

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  // The legacy cookie is only a migration hint. It is never trusted without
  // the same indexed membership check used for a JWT-selected workspace.
  const candidateOrgId = cookieOrgId ?? session.user.orgId;
  const membership = candidateOrgId
    ? await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId: session.user.id, orgId: candidateOrgId } },
      select: {
        role: true,
        orgId: true,
        onboardingCompletedAt: true,
        organization: { select: { id: true, name: true, color: true } },
      },
    })
    : null;

  const organizations = membership ? [{
    id: membership.organization.id,
    name: membership.organization.name,
    color: membership.organization.color,
    role: membership.role as OrganizationRole,
  }] : [];

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    orgId: membership?.orgId ?? null,
    orgName: membership?.organization.name ?? null,
    role: (membership?.role as OrganizationRole | undefined) ?? null,
    onboardingCompletedAt: membership?.onboardingCompletedAt ?? null,
    organizations,
  };
});

export async function requireWorkspaceContext(): Promise<WorkspaceContext & { orgId: string }> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  if (!ctx.orgId) redirect("/onboarding");
  return { ...ctx, orgId: ctx.orgId };
}

export async function requireCompletedOnboarding(): Promise<WorkspaceContext & { orgId: string }> {
  const ctx = await requireWorkspaceContext();
  if (!ctx.onboardingCompletedAt) redirect("/onboarding");
  return ctx;
}

export async function requireWorkspaceRole(
  allowed: readonly OrganizationRole[]
): Promise<WorkspaceContext & { orgId: string; role: OrganizationRole }> {
  const ctx = await requireWorkspaceContext();
  if (!ctx.role || !allowed.includes(ctx.role)) redirect("/dashboard");
  return { ...ctx, role: ctx.role };
}
