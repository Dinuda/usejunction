import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const { searchParams } = req.nextUrl;
    const days = Math.min(parseInt(searchParams.get("days") ?? "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totals, byUser, byTool] = await Promise.all([
      prisma.requestMetadata.aggregate({
        where: { orgId, createdAt: { gte: since } },
        _sum: { estimatedCost: true, totalTokens: true },
        _count: { id: true },
      }),
      prisma.requestMetadata.groupBy({
        by: ["userId"],
        where: { orgId, createdAt: { gte: since }, userId: { not: null } },
        _sum: { estimatedCost: true, totalTokens: true },
        _count: { id: true },
        orderBy: { _sum: { estimatedCost: "desc" } },
        take: 10,
      }),
      prisma.requestMetadata.groupBy({
        by: ["toolName"],
        where: { orgId, createdAt: { gte: since }, toolName: { not: null } },
        _sum: { estimatedCost: true },
        _count: { id: true },
        orderBy: { _sum: { estimatedCost: "desc" } },
      }),
    ]);

    const userIds = byUser.map((u) => u.userId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      period: `${days}d`,
      totalCost: totals._sum.estimatedCost ?? 0,
      totalTokens: totals._sum.totalTokens ?? 0,
      totalRequests: totals._count.id,
      byUser: byUser.map((u) => ({
        user: userMap.get(u.userId ?? "") ?? null,
        cost: u._sum.estimatedCost ?? 0,
        tokens: u._sum.totalTokens ?? 0,
        requests: u._count.id,
      })),
      byTool: byTool.map((t) => ({
        toolName: t.toolName,
        cost: t._sum.estimatedCost ?? 0,
        requests: t._count.id,
      })),
    });
  } catch (e) {
    console.error("[org-spend]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
