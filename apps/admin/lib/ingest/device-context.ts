import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@usejunction/db";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { activeDeviceWhere } from "@/lib/devices/decommission";

const activeDeviceIngestInclude = {
  user: { select: { removedAt: true } },
} as const;

export type ActiveIngestDevice = Prisma.DeviceGetPayload<{
  include: typeof activeDeviceIngestInclude;
}>;

export async function findActiveDeviceForIngest(req: NextRequest): Promise<ActiveIngestDevice | null> {
  const device = await findDeviceByBearerToken(req, {
    where: activeDeviceWhere,
    include: activeDeviceIngestInclude,
  });
  if (!device || device.user.removedAt) return null;
  return device;
}

export async function requireActiveDeviceForIngest(
  req: NextRequest,
): Promise<ActiveIngestDevice | NextResponse> {
  const device = await findActiveDeviceForIngest(req);
  if (!device) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return device;
}

export async function findActiveIngestDeviceContext(input: {
  orgId: string;
  userId: string;
  deviceId: string;
}) {
  return prisma.device.findFirst({
    where: {
      id: input.deviceId,
      orgId: input.orgId,
      userId: input.userId,
      ...activeDeviceWhere,
      user: { removedAt: null },
    },
    select: { id: true },
  });
}

export async function resolveUsageIngestContext(
  req: NextRequest,
  input: { orgId?: unknown; userId?: unknown; deviceId?: unknown },
): Promise<{ orgId: string; userId: string; deviceId: string } | NextResponse> {
  const device = await findActiveDeviceForIngest(req);
  if (device) {
    return { orgId: device.orgId, userId: device.userId, deviceId: device.id };
  }

  const authResult = requireIngestAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const orgId = typeof input.orgId === "string" ? input.orgId : null;
  const userId = typeof input.userId === "string" ? input.userId : null;
  const deviceId = typeof input.deviceId === "string" ? input.deviceId : null;
  if (!orgId || !userId || !deviceId) {
    return NextResponse.json({ error: "device context required" }, { status: 400 });
  }

  const contextDevice = await findActiveIngestDeviceContext({ orgId, userId, deviceId });
  if (!contextDevice) {
    return NextResponse.json({ error: "invalid device context" }, { status: 403 });
  }

  return { orgId, userId, deviceId };
}
