import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { getPublicAppUrl } from "@/lib/public-url";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";
import { assertCanEnrollDevice } from "@/lib/saas-billing/status";

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("self_view"));
  if (auth instanceof NextResponse) return auth;
  const developer = await prisma.developer.findFirst({ where: { orgId: auth.orgId, authUserId: auth.userId } });
  if (!developer) return NextResponse.json({ error: "developer profile required" }, { status: 409 });

  const enrollGate = await assertCanEnrollDevice(auth.orgId);
  if (!enrollGate.allowed) {
    return NextResponse.json({ error: enrollGate.message }, { status: 403 });
  }

  const rawToken = generateOpaqueToken("uj_enroll", 32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const token = await prisma.$transaction(async (tx) => {
    await tx.enrollmentToken.deleteMany({ where: { developerId: developer.id, usedAt: null } });
    return tx.enrollmentToken.create({
      data: {
        orgId: auth.orgId,
        teamId: developer.teamId,
        developerId: developer.id,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt,
      },
      select: { id: true },
    });
  });
  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "enrollment_token.created",
    targetType: "enrollment_token",
    targetId: token.id,
  });
  return NextResponse.json(
    {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      controlPlaneUrl: getPublicAppUrl(),
    },
    { status: 201 },
  );
}
