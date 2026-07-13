import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { resolveOrgId } from "@/lib/require-organization";

export type OrganizationRole = "owner" | "admin" | "developer";

export type WorkspaceContext = {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  orgId: string | null;
  orgName: string | null;
  role: OrganizationRole | null;
  organizations: Array<{ id: string; name: string; role: OrganizationRole }>;
};

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  const orgId = await resolveOrgId(session.user.id, session.user.orgId);

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      orgId: true,
      organization: { select: { id: true, name: true } },
    },
  });

  const organizations = memberships.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    role: membership.role as OrganizationRole,
  }));

  const active = memberships.find((membership) => membership.orgId === orgId) ?? memberships[0] ?? null;

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    orgId: active?.orgId ?? null,
    orgName: active?.organization.name ?? null,
    role: (active?.role as OrganizationRole | undefined) ?? null,
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
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: ctx.userId, orgId: ctx.orgId } },
    select: { onboardingCompletedAt: true },
  });
  if (!membership?.onboardingCompletedAt) redirect("/onboarding");
  return ctx;
}

export async function requireWorkspaceRole(
  allowed: readonly OrganizationRole[]
): Promise<WorkspaceContext & { orgId: string; role: OrganizationRole }> {
  const ctx = await requireWorkspaceContext();
  if (!ctx.role || !allowed.includes(ctx.role)) redirect("/dashboard");
  return { ...ctx, role: ctx.role };
}
