import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSession } from "@/auth";
import { prisma } from "@usejunction/db";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";
import { ASSIGNABLE_ROLES } from "@/lib/rbac/permissions";

const schema = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  const { id: developerId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const developer = await prisma.developer.findFirst({
    where: { id: developerId, orgId: auth.orgId, removedAt: null },
    select: { id: true, role: true, authUserId: true, email: true },
  });
  if (!developer) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let membershipRole: string | null = null;
  if (developer.authUserId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId: developer.authUserId, orgId: auth.orgId } },
      select: { role: true },
    });
    membershipRole = membership?.role ?? null;
  }

  // Linked users: OrganizationMembership.role is authoritative.
  // Unlinked roster rows: Developer.role only.
  const currentRole = developer.authUserId ? (membershipRole ?? developer.role) : developer.role;
  if (currentRole === "owner") {
    return NextResponse.json({ error: "cannot change owner role" }, { status: 403 });
  }

  const nextRole = parsed.data.role;

  await prisma.$transaction(async (tx) => {
    if (developer.authUserId) {
      await tx.organizationMembership.updateMany({
        where: { userId: developer.authUserId, orgId: auth.orgId },
        data: { role: nextRole },
      });
      // Mirror for compatibility with any remaining UI reads of Developer.role.
      await tx.developer.update({
        where: { id: developer.id },
        data: { role: nextRole },
      });
    } else {
      await tx.developer.update({
        where: { id: developer.id },
        data: { role: nextRole },
      });
    }
  });

  // Keep the actor's JWT role in sync when they change their own membership.
  // Other members pick up the new role on their next workspace update / session refresh.
  if (developer.authUserId === auth.userId) {
    await updateSession({ user: { orgId: auth.orgId } });
  }

  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "member.role_updated",
    targetType: "developer",
    targetId: developer.id,
    metadata: { email: developer.email, from: currentRole, to: nextRole },
  });

  return NextResponse.json({ id: developer.id, role: nextRole });
}
