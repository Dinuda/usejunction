import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        devices: {
          select: { id: true, hostname: true, status: true, lastSeenAt: true },
        },
        _count: { select: { requestMetadata: true } },
      },
    });

    const recentActivity = await prisma.requestMetadata.groupBy({
      by: ["userId"],
      where: { orgId, createdAt: { gte: since7d }, userId: { not: null } },
      _count: { id: true },
      _sum: { estimatedCost: true },
    });

    const activityMap = new Map(
      recentActivity.map((a) => [a.userId, { requests7d: a._count.id, cost7d: a._sum.estimatedCost ?? 0 }])
    );

    return NextResponse.json({
      developers: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        teamId: u.teamId,
        createdAt: u.createdAt,
        totalRequests: u._count.requestMetadata,
        devices: u.devices,
        ...activityMap.get(u.id) ?? { requests7d: 0, cost7d: 0 },
      })),
    });
  } catch (e) {
    console.error("[dashboard/developers]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
