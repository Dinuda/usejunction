import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";

async function getDevice(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return prisma.device.findUnique({ where: { deviceToken: auth.slice(7) } });
}

export async function POST(req: NextRequest) {
  const device = await getDevice(req);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { tools } = await req.json();
  if (!Array.isArray(tools)) {
    return NextResponse.json({ error: "tools array required" }, { status: 400 });
  }

  for (const t of tools) {
    await prisma.toolInstallation.upsert({
      where: { deviceId_toolName: { deviceId: device.id, toolName: t.toolName } },
      create: {
        orgId: device.orgId,
        userId: device.userId,
        deviceId: device.id,
        toolName: t.toolName,
        detected: t.detected ?? false,
        configured: t.configured ?? false,
        configPath: t.configPath,
        version: t.version,
      },
      update: {
        detected: t.detected ?? false,
        configured: t.configured ?? false,
        configPath: t.configPath,
        version: t.version,
        lastCheckedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true, count: tools.length });
}
