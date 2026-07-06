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

  const { models } = await req.json();
  if (!Array.isArray(models)) {
    return NextResponse.json({ error: "models array required" }, { status: 400 });
  }

  for (const m of models) {
    await prisma.localModel.upsert({
      where: {
        deviceId_provider_modelName: {
          deviceId: device.id,
          provider: m.provider,
          modelName: m.modelName,
        },
      },
      create: {
        orgId: device.orgId,
        userId: device.userId,
        deviceId: device.id,
        provider: m.provider,
        modelName: m.modelName,
        size: m.size,
        running: m.running ?? false,
      },
      update: {
        size: m.size,
        running: m.running ?? false,
        lastSeenAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true, count: models.length });
}
