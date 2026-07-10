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

    const body = await req.json();
    const tools = body.tools;
    if (!Array.isArray(tools)) {
      return NextResponse.json({ error: "tools array required" }, { status: 400 });
    }

    let upserted = 0;
    for (const tool of tools) {
      if (!tool.toolName) continue;

      await prisma.toolInstallation.upsert({
        where: { deviceId_toolName: { deviceId: device.id, toolName: tool.toolName } },
        update: {
          detected: tool.detected ?? true,
          configured: tool.configured ?? false,
          configPath: tool.configPath ?? null,
          version: tool.version ?? null,
          lastCheckedAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          toolName: tool.toolName,
          detected: tool.detected ?? true,
          configured: tool.configured ?? false,
          configPath: tool.configPath ?? null,
          version: tool.version ?? null,
        },
      });
      upserted += 1;
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/tools]", e);
    return NextResponse.json({ error: "tools upsert failed" }, { status: 500 });
  }
}
