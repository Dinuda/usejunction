import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";
import { updateDirectiveForHeartbeat } from "@/lib/agent-updates";
import { encryptSecret, hashOpaqueToken } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const device = await prisma.device.findUnique({ where: { deviceToken: token } });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const localEndpoint =
      typeof body.localEndpoint === "string" && body.localEndpoint.startsWith("http://127.0.0.1")
        ? body.localEndpoint.slice(0, 128)
        : undefined;
    const localSyncToken =
      typeof body.localSyncToken === "string" && body.localSyncToken.length >= 16
        ? body.localSyncToken.slice(0, 256)
        : undefined;

    await prisma.$transaction(async (tx) => {
      // Only one agent can own a loopback sync port — drop stale claims so the
      // dashboard never bounces with a token that the running daemon rejects.
      if (localEndpoint) {
        await tx.device.updateMany({
          where: {
            localEndpoint,
            id: { not: device.id },
          },
          data: {
            localEndpoint: null,
            localSyncTokenHash: null,
            localSyncTokenEnc: null,
          },
        });
      }

      await tx.device.update({
        where: { id: device.id },
        data: {
          lastSeenAt: new Date(),
          status: "online",
          ...(body.agentVersion ? { agentVersion: String(body.agentVersion).slice(0, 64) } : {}),
          ...(body.os ? { os: String(body.os).slice(0, 64) } : {}),
          ...(body.architecture ? { architecture: String(body.architecture).slice(0, 64) } : {}),
          ...(body.hostname ? { hostname: String(body.hostname).slice(0, 255) } : {}),
          ...(localEndpoint ? { localEndpoint } : {}),
          ...(localSyncToken
            ? {
                localSyncTokenHash: hashOpaqueToken(localSyncToken),
                localSyncTokenEnc: encryptSecret(localSyncToken),
              }
            : {}),
        },
      });
    });

    let update = null;
    try {
      update = await updateDirectiveForHeartbeat({
        id: device.id,
        orgId: device.orgId,
        os: typeof body.os === "string" ? body.os : device.os,
        architecture: typeof body.architecture === "string" ? body.architecture : device.architecture,
        agentVersion: typeof body.agentVersion === "string" ? body.agentVersion : device.agentVersion,
      });
    } catch (error) {
      console.error("[devices/heartbeat-update]", error);
    }

    return NextResponse.json({ ok: true, deviceId: device.id, update });
  } catch (e) {
    console.error("[devices/heartbeat]", e);
    return NextResponse.json({ error: "heartbeat failed" }, { status: 500 });
  }
}
