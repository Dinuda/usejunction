import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [localAggs, gatewayAggs, users] = await Promise.all([
    prisma.localUsageAggregate.groupBy({
      by: ["userId", "toolName"],
      where: { orgId, date: { gte: today } },
      _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
    }),
    prisma.requestMetadata.groupBy({
      by: ["userId", "toolName"],
      where: { orgId, createdAt: { gte: today } },
      _sum: { estimatedCost: true, totalTokens: true },
    }),
    prisma.user.findMany({ where: { orgId } }),
  ]);

  const flagged = [];
  for (const local of localAggs) {
    const gateway = gatewayAggs.find(
      (g) => g.userId === local.userId && g.toolName === local.toolName
    );
    const localCost = local._sum.estimatedCost || 0;
    const gatewayCost = gateway?._sum.estimatedCost || 0;
    const delta =
      gatewayCost > 0 ? ((localCost - gatewayCost) / gatewayCost) * 100 : localCost > 0 ? 100 : 0;

    if (localCost > gatewayCost * 1.5 && localCost > 0.01) {
      const user = users.find((u) => u.id === local.userId);
      flagged.push({
        userId: local.userId,
        userName: user?.name,
        toolName: local.toolName,
        localCost,
        gatewayCost,
        deltaPercent: Math.round(delta),
      });
    }
  }

  return NextResponse.json({ flagged, threshold: 1.5 });
}
