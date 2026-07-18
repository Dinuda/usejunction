import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { usageDayFilter, usageWindowDays } from "@/lib/metrics/date-range";
import { requireOrgRole, rolesFor } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = auth.orgId;
    if (!orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });
    const usage30d = usageWindowDays(30);

    const gatewayByUser = await prisma.requestMetadata.groupBy({
      by: ["userId"],
      where: { orgId, source: "gateway", createdAt: { gte: usage30d.from }, userId: { not: null } },
      _count: { id: true },
      _sum: { totalTokens: true, estimatedCost: true },
    });

    const localByUser = await prisma.localUsageAggregate.groupBy({
      by: ["userId"],
      where: { orgId, date: usageDayFilter(usage30d.from, usage30d.to) },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    });

    const users = await prisma.developer.findMany({
      where: { orgId },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const gatewayMap = new Map(gatewayByUser.map((g) => [g.userId, g]));
    const localMap = new Map(localByUser.map((l) => [l.userId, l]));

    const allUserIds = new Set([...gatewayMap.keys(), ...localMap.keys()].filter(Boolean) as string[]);

    const suspects = Array.from(allUserIds)
      .map((userId) => {
        const g = gatewayMap.get(userId);
        const l = localMap.get(userId);
        const gatewayTokens = g?._sum.totalTokens ?? 0;
        const localTokens = (l?._sum.inputTokens ?? 0) + (l?._sum.outputTokens ?? 0);
        const bypassRatio = localTokens > 0 && gatewayTokens === 0 ? 1 : localTokens / (gatewayTokens + localTokens || 1);

        return {
          userId,
          user: userMap.get(userId) ?? null,
          gatewayRequests: g?._count.id ?? 0,
          gatewayTokens,
          gatewayCost: g?._sum.estimatedCost ?? 0,
          localTokens,
          localCost: l?._sum.estimatedCost ?? 0,
          bypassRatio: Math.round(bypassRatio * 100),
          flagged: bypassRatio > 0.5 && localTokens > 1000,
        };
      })
      .sort((a, b) => b.bypassRatio - a.bypassRatio);

    return NextResponse.json({ suspects, period: "30d" });
  } catch (e) {
    console.error("[bypass]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
