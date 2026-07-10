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
    const models = body.models;
    if (!Array.isArray(models)) {
      return NextResponse.json({ error: "models array required" }, { status: 400 });
    }

    let upserted = 0;
    for (const m of models) {
      if (!m.provider || !m.modelName) continue;

      await prisma.localModel.upsert({
        where: {
          deviceId_provider_modelName: {
            deviceId: device.id,
            provider: m.provider,
            modelName: m.modelName,
          },
        },
        update: {
          size: m.size ?? null,
          running: m.running ?? false,
          lastSeenAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          provider: m.provider,
          modelName: m.modelName,
          size: m.size ?? null,
          running: m.running ?? false,
        },
      });
      upserted += 1;
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/local-models]", e);
    return NextResponse.json({ error: "local-models upsert failed" }, { status: 500 });
  }
}
