import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";

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

    await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        status: "online",
        ...(body.agentVersion ? { agentVersion: body.agentVersion } : {}),
        ...(body.os ? { os: body.os } : {}),
        ...(body.architecture ? { architecture: body.architecture } : {}),
        ...(body.hostname ? { hostname: body.hostname } : {}),
      },
    });

    return NextResponse.json({ ok: true, deviceId: device.id });
  } catch (e) {
    console.error("[devices/heartbeat]", e);
    return NextResponse.json({ error: "heartbeat failed" }, { status: 500 });
  }
}
