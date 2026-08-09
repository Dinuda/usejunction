import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { audit, rolesFor } from "@/lib/rbac";
import { buildPlatformInstallCommands } from "@/lib/connect-command";
import { issueRepairEnrollmentToken } from "@/lib/enrollment-token";
import { getPublicAppUrl } from "@/lib/public-url";
import { browserMutationGuard } from "@/lib/security/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const rejected = browserMutationGuard(req);
  if (rejected) return rejected;

  const principal = await requireAppPrincipal(req, rolesFor("self_view"));
  if (principal instanceof NextResponse) return principal;

  const { id: deviceId } = await context.params;

  const developer = await prisma.developer.findFirst({
    where: { orgId: principal.orgId, authUserId: principal.userId, removedAt: null },
    select: { id: true },
  });
  if (!developer) {
    return NextResponse.json({ error: "developer profile required" }, { status: 409 });
  }

  const device = await prisma.device.findFirst({
    where: { id: deviceId, orgId: principal.orgId, decommissionedAt: null },
    select: { id: true, userId: true, hostname: true },
  });
  if (!device) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }
  if (device.userId !== developer.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issued = await issueRepairEnrollmentToken({
    orgId: principal.orgId,
    developerId: developer.id,
    deviceId: device.id,
  });

  const controlPlaneUrl = getPublicAppUrl(req);
  const commands = buildPlatformInstallCommands(issued.token, controlPlaneUrl);

  await audit({
    orgId: principal.orgId,
    actorType: "user",
    actorId: principal.userId,
    action: "device.repair_token_issued",
    targetType: "device",
    targetId: device.id,
  });

  return NextResponse.json(
    {
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      controlPlaneUrl,
      commands,
      deviceId: device.id,
      hostname: device.hostname,
    },
    { status: 201 },
  );
}
