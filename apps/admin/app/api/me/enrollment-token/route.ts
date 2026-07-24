import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { getPublicAppUrl } from "@/lib/public-url";
import { assertCanEnrollDevice } from "@/lib/saas-billing/status";
import { issueEnrollmentToken } from "@/lib/enrollment-token";
import { limitedJson } from "@/lib/security/http";

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("self_view"));
  if (auth instanceof NextResponse) return auth;
  const developer = await prisma.developer.findFirst({ where: { orgId: auth.orgId, authUserId: auth.userId } });
  if (!developer) return NextResponse.json({ error: "developer profile required" }, { status: 409 });

  const enrollGate = await assertCanEnrollDevice(auth.orgId, developer.id);
  if (!enrollGate.allowed) {
    return NextResponse.json({ error: enrollGate.message }, { status: 403 });
  }

  const parsedBody = await limitedJson(req, 1024);
  const body = parsedBody.ok ? (parsedBody.data as Record<string, unknown>) : {};
  const rotate = body.rotate === true;

  const issued = await issueEnrollmentToken({
    orgId: auth.orgId,
    developerId: developer.id,
    rotate,
  });
  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: rotate ? "enrollment_token.rotated" : "enrollment_token.created",
    targetType: "enrollment_token",
    targetId: issued.id,
  });
  return NextResponse.json(
    {
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      controlPlaneUrl: getPublicAppUrl(),
    },
    { status: 201 },
  );
}
