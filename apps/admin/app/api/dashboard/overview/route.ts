import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalRequests,
      requests7d,
      totalDevices,
      onlineDevices,
      totalDevelopers,
      totalCostAgg,
      cost7dAgg,
      errorRequests7d,
    ] = await Promise.all([
      prisma.requestMetadata.count({ where: { orgId } }),
      prisma.requestMetadata.count({ where: { orgId, createdAt: { gte: since7d } } }),
      prisma.device.count({ where: { orgId } }),
      prisma.device.count({ where: { orgId, status: "online", lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } }),
      prisma.user.count({ where: { orgId } }),
      prisma.requestMetadata.aggregate({ where: { orgId }, _sum: { estimatedCost: true } }),
      prisma.requestMetadata.aggregate({ where: { orgId, createdAt: { gte: since7d } }, _sum: { estimatedCost: true } }),
      prisma.requestMetadata.count({ where: { orgId, createdAt: { gte: since7d }, status: { not: "success" } } }),
    ]);

    const totalCost = totalCostAgg._sum.estimatedCost ?? 0;
    const cost7d = cost7dAgg._sum.estimatedCost ?? 0;

    const recentActivity = await prisma.requestMetadata.findMany({
      where: { orgId, createdAt: { gte: since30d } },
      select: { createdAt: true, estimatedCost: true, toolName: true },
      orderBy: { createdAt: "asc" },
    });

    const byDay: Record<string, { requests: number; cost: number }> = {};
    for (const r of recentActivity) {
      const day = r.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { requests: 0, cost: 0 };
      byDay[day].requests++;
      byDay[day].cost += r.estimatedCost;
    }

    const topTools = await prisma.requestMetadata.groupBy({
      by: ["toolName"],
      where: { orgId, createdAt: { gte: since7d }, toolName: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    return NextResponse.json({
      totalRequests,
      requests7d,
      totalDevices,
      onlineDevices,
      totalDevelopers,
      totalCost,
      cost7d,
      errorRate7d: requests7d > 0 ? (errorRequests7d / requests7d) * 100 : 0,
      activityByDay: Object.entries(byDay).map(([date, v]) => ({ date, ...v })),
      topTools: topTools.map((t) => ({ toolName: t.toolName, requests: t._count.id })),
    });
  } catch (e) {
    console.error("[dashboard/overview]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
