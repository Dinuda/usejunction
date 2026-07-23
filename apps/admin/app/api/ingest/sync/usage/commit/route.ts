import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { commitUsageSync } from "@/lib/sync/usage-sync";
import { prisma } from "@usejunction/db";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const parsedBody = await limitedJson(req, 64 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;

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
      orgId = typeof body.orgId === "string" ? body.orgId : null;
      userId = typeof body.userId === "string" ? body.userId : null;
      deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    }
    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const syncRunId = typeof body.syncRunId === "string" ? body.syncRunId : "";
    if (!syncRunId) return NextResponse.json({ error: "syncRunId required" }, { status: 400 });

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    const result = await commitUsageSync({
      orgId,
      deviceId,
      syncRunId,
      expectedChunks: typeof body.expectedChunks === "number" ? body.expectedChunks : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logServerError("sync/usage/commit", error);
    return NextResponse.json({ error: "sync commit failed" }, { status: 500 });
  }
}
