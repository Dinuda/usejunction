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

  const { aggregates } = await req.json();
  if (!Array.isArray(aggregates)) {
    return NextResponse.json({ error: "aggregates array required" }, { status: 400 });
  }

  for (const a of aggregates) {
    const date = new Date(a.date);
    await prisma.localUsageAggregate.upsert({
      where: {
        deviceId_date_toolName_model: {
          deviceId: device.id,
          date,
          toolName: a.toolName,
          model: a.model || "",
        },
      },
      create: {
        orgId: device.orgId,
        userId: device.userId,
        deviceId: device.id,
        date,
        toolName: a.toolName,
        model: a.model || "",
        inputTokens: a.inputTokens || 0,
        outputTokens: a.outputTokens || 0,
        cacheReadTokens: a.cacheReadTokens || 0,
        estimatedCost: a.estimatedCost || 0,
        source: "local_scan",
      },
      update: {
        inputTokens: a.inputTokens || 0,
        outputTokens: a.outputTokens || 0,
        cacheReadTokens: a.cacheReadTokens || 0,
        estimatedCost: a.estimatedCost || 0,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
