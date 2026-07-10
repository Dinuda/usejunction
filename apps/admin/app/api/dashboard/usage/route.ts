import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const { searchParams } = req.nextUrl;
    const days = Math.min(parseInt(searchParams.get("days") ?? "30"), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const byModel = await prisma.requestMetadata.groupBy({
      by: ["model"],
      where: { orgId, createdAt: { gte: since }, model: { not: null } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
      take: 20,
    });

    const byTool = await prisma.requestMetadata.groupBy({
      by: ["toolName"],
      where: { orgId, createdAt: { gte: since }, toolName: { not: null } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
    });

    const byDay = await prisma.requestMetadata.groupBy({
      by: ["createdAt"],
      where: { orgId, createdAt: { gte: since } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
    });

    const localUsage = await prisma.localUsageAggregate.groupBy({
      by: ["toolName", "model"],
      where: { orgId, date: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
    });

    const dailyMap: Record<string, { requests: number; tokens: number; cost: number }> = {};
    for (const row of byDay) {
      const day = row.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { requests: 0, tokens: 0, cost: 0 };
      dailyMap[day].requests += row._count.id;
      dailyMap[day].tokens += row._sum.totalTokens ?? 0;
      dailyMap[day].cost += row._sum.estimatedCost ?? 0;
    }

    return NextResponse.json({
      byModel: byModel.map((m) => ({
        model: m.model,
        requests: m._count.id,
        tokens: m._sum.totalTokens ?? 0,
        cost: m._sum.estimatedCost ?? 0,
      })),
      byTool: byTool.map((t) => ({
        toolName: t.toolName,
        requests: t._count.id,
        tokens: t._sum.totalTokens ?? 0,
        cost: t._sum.estimatedCost ?? 0,
      })),
      byDay: Object.entries(dailyMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      localUsage: localUsage.map((l) => ({
        toolName: l.toolName,
        model: l.model,
        inputTokens: l._sum.inputTokens ?? 0,
        outputTokens: l._sum.outputTokens ?? 0,
        cost: l._sum.estimatedCost ?? 0,
      })),
    });
  } catch (e) {
    console.error("[dashboard/usage]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
