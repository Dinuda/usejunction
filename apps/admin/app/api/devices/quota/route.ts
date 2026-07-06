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

  const { quotas } = await req.json();
  if (!Array.isArray(quotas)) {
    return NextResponse.json({ error: "quotas array required" }, { status: 400 });
  }

  for (const q of quotas) {
    await prisma.quotaSnapshot.create({
      data: {
        orgId: device.orgId,
        deviceId: device.id,
        toolName: q.toolName,
        windowType: q.windowType,
        usedPercent: q.usedPercent,
        resetAt: q.resetAt ? new Date(q.resetAt) : null,
        creditsRemaining: q.creditsRemaining,
        source: q.source || "cli_rpc",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
