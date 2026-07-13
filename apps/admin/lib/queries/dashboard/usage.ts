import { prisma } from "@usejunction/db";

export interface DashboardUsageData {
  byModel: Array<{ model: string | null; requests: number; tokens: number; cost: number }>;
  byTool: Array<{ toolName: string | null; requests: number; tokens: number; cost: number }>;
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  localUsage: Array<{
    toolName: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

export async function getDashboardUsage(orgId: string, days = 30): Promise<DashboardUsageData> {
  const cappedDays = Math.min(days, 90);
  const since = new Date(Date.now() - cappedDays * 24 * 60 * 60 * 1000);

  const [byModel, byTool, byDayRows, localUsage] = await Promise.all([
    prisma.requestMetadata.groupBy({
      by: ["model"],
      where: { orgId, createdAt: { gte: since }, model: { not: null } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
      take: 20,
    }),
    prisma.requestMetadata.groupBy({
      by: ["toolName"],
      where: { orgId, createdAt: { gte: since }, toolName: { not: null } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
    }),
    prisma.$queryRaw<Array<{ day: Date; requests: bigint; tokens: bigint; cost: number }>>`
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*)::bigint AS requests,
             COALESCE(SUM(total_tokens), 0)::bigint AS tokens,
             COALESCE(SUM(estimated_cost), 0)::float AS cost
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.localUsageAggregate.groupBy({
      by: ["toolName", "model"],
      where: { orgId, date: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      orderBy: { _sum: { estimatedCost: "desc" } },
    }),
  ]);

  return {
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
    byDay: byDayRows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      requests: Number(row.requests),
      tokens: Number(row.tokens),
      cost: row.cost,
    })),
    localUsage: localUsage.map((l) => ({
      toolName: l.toolName,
      model: l.model,
      inputTokens: l._sum.inputTokens ?? 0,
      outputTokens: l._sum.outputTokens ?? 0,
      cost: l._sum.estimatedCost ?? 0,
    })),
  };
}
