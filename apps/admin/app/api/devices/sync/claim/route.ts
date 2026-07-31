import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken } from "@/lib/auth";
import { claimDeviceSyncTargets } from "@/lib/sync/remote-sync";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  try {
    const device = await findDeviceByBearerToken(req, {
      where: { decommissionedAt: null },
      include: { user: { select: { removedAt: true } } },
    });
    if (!device || device.user.removedAt) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const claimed = await claimDeviceSyncTargets({ id: device.id, orgId: device.orgId });
    return NextResponse.json({ ok: true, ...claimed });
  } catch (error) {
    logServerError("devices/sync/claim", error);
    return NextResponse.json({ error: "sync claim failed" }, { status: 500 });
  }
}
