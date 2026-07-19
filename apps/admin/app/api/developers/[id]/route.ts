import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { audit, requireOrgRole, rolesFor } from "@/lib/rbac";
import { decommissionDevices } from "@/lib/devices/decommission";
import { syncTeamSeatQuantityBestEffort } from "@/lib/saas-billing/lemonsqueezy";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  const { id: developerId } = await params;

  const developer = await prisma.developer.findFirst({
    where: { id: developerId, orgId: auth.orgId, removedAt: null },
    select: {
      id: true,
      role: true,
      authUserId: true,
      email: true,
      name: true,
      devices: { select: { id: true } },
    },
  });
  if (!developer) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (developer.role === "owner") {
    return NextResponse.json({ error: "cannot remove workspace owner" }, { status: 403 });
  }

  if (developer.authUserId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { userId_orgId: { userId: developer.authUserId, orgId: auth.orgId } },
      select: { role: true },
    });
    if (membership?.role === "owner") {
      return NextResponse.json({ error: "cannot remove workspace owner" }, { status: 403 });
    }
  }

  if (developer.authUserId === auth.userId) {
    return NextResponse.json({ error: "cannot remove yourself" }, { status: 403 });
  }

  const removedAt = new Date();
  const deviceIds = developer.devices.map((device) => device.id);

  await prisma.$transaction(async (tx) => {
    await tx.developer.update({
      where: { id: developer.id },
      data: { removedAt, authUserId: null },
    });

    if (developer.authUserId) {
      await tx.organizationMembership.deleteMany({
        where: { userId: developer.authUserId, orgId: auth.orgId },
      });
    }

    await tx.enrollmentToken.deleteMany({
      where: { developerId: developer.id, usedAt: null },
    });

    // Keep device tokens valid so the next heartbeat can deliver an uninstall
    // directive; coverage drops immediately via decommissionedAt.
    await decommissionDevices(tx, deviceIds, removedAt);
  });

  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "member.removed",
    targetType: "developer",
    targetId: developer.id,
    metadata: {
      email: developer.email,
      name: developer.name,
      role: developer.role,
      devicesDecommissioned: deviceIds.length,
    },
  });

  await syncTeamSeatQuantityBestEffort(auth.orgId, "member.removed");

  return NextResponse.json({
    ok: true,
    id: developer.id,
    removedAt: removedAt.toISOString(),
    devicesDecommissioned: deviceIds.length,
  });
}
