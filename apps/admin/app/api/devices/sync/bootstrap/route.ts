import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken } from "@/lib/auth";
import { createDeviceRealtimeTokenRequest, REMOTE_SYNC_PROTOCOL } from "@/lib/sync/remote-sync";
import { logServerError } from "@/lib/errors/public";

export async function POST(req: NextRequest) {
  try {
    const device = await findDeviceByBearerToken(req, {
      where: { decommissionedAt: null },
      select: { id: true, orgId: true, userId: true },
    });
    if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const tokenRequest = await createDeviceRealtimeTokenRequest(device);
    return NextResponse.json({
      ok: true,
      realtime: {
        provider: "ably",
        protocol: REMOTE_SYNC_PROTOCOL,
        channels: [`device-sync:org:${device.orgId}`, `device-sync:developer:${device.userId}`],
        tokenRequest,
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    if (status >= 500) logServerError("devices/sync/bootstrap", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync bootstrap failed" },
      { status },
    );
  }
}
