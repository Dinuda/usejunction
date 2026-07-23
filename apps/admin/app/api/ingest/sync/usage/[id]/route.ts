import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { logServerError } from "@/lib/errors/public";
import { getUsageSyncStatus } from "@/lib/sync/usage-sync";
import { prisma } from "@usejunction/db";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: syncRunId } = await context.params;
    let orgId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;

    const device = await findDeviceByBearerToken(req, {});
    if (device) {
      orgId = device.orgId;
      userId = device.userId;
      deviceId = device.id;
    }
    if (!deviceId) {
      const authResult = requireIngestAuth(req);
      if (authResult instanceof NextResponse) return authResult;
      orgId = req.nextUrl.searchParams.get("orgId");
      userId = req.nextUrl.searchParams.get("userId");
      deviceId = req.nextUrl.searchParams.get("deviceId");
    }
    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    const status = await getUsageSyncStatus({ orgId, deviceId, syncRunId });
    if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    logServerError("sync/usage/status", error);
    return NextResponse.json({ error: "sync status failed" }, { status: 500 });
  }
}
