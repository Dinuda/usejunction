import { randomBytes } from "crypto";
import { prisma } from "@usejunction/db";
import { trialEndsAtFromNow } from "@/lib/billing/entitlements";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || `org-${randomBytes(3).toString("hex")}`;
}

export function suggestedWorkspaceName(email: string) {
  const domain = email.split("@")[1]?.split(".")[0] ?? "";
  return domain ? `${domain.charAt(0).toUpperCase()}${domain.slice(1)} Engineering` : "New Workspace";
}

type WorkspaceUser = {
  id: string;
  email: string;
  name?: string | null;
};

export async function createWorkspace(user: WorkspaceUser, options?: { name?: string }) {
  const name = options?.name?.trim() || suggestedWorkspaceName(user.email);
  const slug = `${slugify(name)}-${randomBytes(2).toString("hex")}`;
  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name, slug, plan: "trial", trialEndsAt: trialEndsAtFromNow() },
    });
    const team = await tx.team.create({ data: { orgId: org.id, name: "Platform" } });
    await tx.organizationMembership.create({ data: { userId: user.id, orgId: org.id, role: "owner" } });
    await tx.developer.create({
      data: {
        orgId: org.id,
        teamId: team.id,
        authUserId: user.id,
        name: user.name?.trim() || user.email.split("@")[0],
        email: user.email.trim().toLowerCase(),
        role: "owner",
      },
    });
    await tx.planInterest.updateMany({ where: { userId: user.id, orgId: null }, data: { orgId: org.id } });
    return org;
  });

  return {
    orgId: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: "owner" as const,
    created: true as const,
  };
}

export async function ensureOwnerWorkspace(user: WorkspaceUser) {
  const existing = await prisma.organizationMembership.findFirst({
    where: { userId: user.id },
    select: { orgId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return { orgId: existing.orgId, role: existing.role, created: false as const };
  }

  return createWorkspace(user);
}
