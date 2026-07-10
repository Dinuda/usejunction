import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();

    const models = await prisma.localModel.findMany({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        device: { select: { hostname: true, os: true } },
      },
    });

    const summary = await prisma.localModel.groupBy({
      by: ["provider", "modelName"],
      where: { orgId },
      _count: { id: true },
    });

    return NextResponse.json({
      models: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        modelName: m.modelName,
        size: m.size,
        running: m.running,
        lastSeenAt: m.lastSeenAt,
        user: m.user,
        device: m.device,
      })),
      summary: summary.map((s) => ({
        provider: s.provider,
        modelName: s.modelName,
        deviceCount: s._count.id,
      })),
    });
  } catch (e) {
    console.error("[dashboard/local-models]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
