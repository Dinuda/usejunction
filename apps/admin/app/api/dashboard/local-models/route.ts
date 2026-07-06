import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();

  const models = await prisma.localModel.findMany({
    where: { orgId },
    include: { device: true, user: true },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({
    models: models.map((m) => ({
      id: m.id,
      device: m.device.hostname,
      user: m.user.name,
      provider: m.provider,
      modelName: m.modelName,
      size: m.size,
      running: m.running,
      lastSeenAt: m.lastSeenAt,
    })),
  });
}
