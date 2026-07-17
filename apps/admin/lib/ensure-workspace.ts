import { randomBytes } from "crypto";
import { prisma } from "@usejunction/db";
import {
  AuthUserNotFoundError,
  isMissingAuthUserPrismaError,
  resolveAuthUser,
  type AuthUserInput,
} from "@/lib/ensure-auth-user";
import { trialEndsAtFromNow } from "@/lib/billing/entitlements";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `org-${randomBytes(3).toString("hex")}`
  );
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Default workspace label from the person's name, or email local-part.
 * e.g. "Dinu Devs" → "Dinu Devs workspace"; "dinu.dayan" → "Dinu Dayan workspace"
 */
export function suggestedWorkspaceName(user: { email: string; name?: string | null }) {
  const fromName = user.name?.trim();
  if (fromName) {
    return `${fromName} workspace`.slice(0, 80);
  }

  const local = user.email.split("@")[0] ?? "";
  const cleaned = local
    .replace(/[._+\-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim();
  const person = titleCaseWords(cleaned) || "My";
  return `${person} workspace`.slice(0, 80);
}

export type WorkspaceUser = AuthUserInput;

export async function createWorkspace(
  user: WorkspaceUser,
  options?: { name?: string; color?: string | null },
) {
  const authUser = await resolveAuthUser(user);
  const name = options?.name?.trim() || suggestedWorkspaceName(authUser);
  const slug = `${slugify(name)}-${randomBytes(2).toString("hex")}`;
  const color = options?.color?.trim() || null;

  let organization;
  try {
    organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name, slug, color, plan: "trial", trialEndsAt: trialEndsAtFromNow() },
      });
      const team = await tx.team.create({ data: { orgId: org.id, name: "Platform" } });
      await tx.organizationMembership.create({
        data: { userId: authUser.id, orgId: org.id, role: "owner" },
      });
      await tx.developer.create({
        data: {
          orgId: org.id,
          teamId: team.id,
          authUserId: authUser.id,
          name: authUser.name?.trim() || authUser.email.split("@")[0],
          email: authUser.email.trim().toLowerCase(),
          role: "owner",
        },
      });
      await tx.planInterest.updateMany({
        where: { userId: authUser.id, orgId: null },
        data: { orgId: org.id },
      });
      return org;
    });
  } catch (error) {
    if (isMissingAuthUserPrismaError(error)) {
      throw new AuthUserNotFoundError();
    }
    throw error;
  }

  return {
    orgId: organization.id,
    name: organization.name,
    slug: organization.slug,
    color: organization.color,
    role: "owner" as const,
    created: true as const,
  };
}

/** Returns an existing membership (newest first) or creates a personal workspace. */
export async function ensureOwnerWorkspace(user: WorkspaceUser, options?: { name?: string }) {
  const authUser = await resolveAuthUser(user);
  const existing = await prisma.organizationMembership.findFirst({
    where: { userId: authUser.id },
    select: { orgId: true, role: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return { orgId: existing.orgId, role: existing.role, created: false as const };
  }

  return createWorkspace(authUser, options);
}
