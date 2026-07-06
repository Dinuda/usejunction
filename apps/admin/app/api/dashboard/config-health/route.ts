import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [users, devices, installations, accounts, localAggs, gatewayAggs] = await Promise.all([
    prisma.user.findMany({ where: { orgId } }),
    prisma.device.findMany({ where: { orgId } }),
    prisma.toolInstallation.findMany({ where: { orgId } }),
    prisma.toolAccount.findMany({ where: { orgId } }),
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
  ]);

  const enrolledUserIds = new Set(devices.map((d) => d.userId));
  const notInstalled = users.filter((u) => !enrolledUserIds.has(u.id));

  const bypassSuspects: Array<Record<string, unknown>> = [];
  for (const local of localAggs) {
    const gateway = gatewayAggs.find(
      (g) => g.userId === local.userId && g.toolName === local.toolName
    );
    const localCost = local._sum.estimatedCost || 0;
    const gatewayCost = gateway?._sum.estimatedCost || 0;
    if (localCost > gatewayCost * 1.5 && localCost > 0.01) {
      const user = users.find((u) => u.id === local.userId);
      bypassSuspects.push({
        user: user?.name,
        tool: local.toolName,
        localCost,
        gatewayCost,
        deltaPercent: gatewayCost > 0 ? Math.round(((localCost - gatewayCost) / gatewayCost) * 100) : 100,
      });
    }
  }

  const personalAccounts = accounts.filter((a) => a.loginMethod === "personal" || a.loginMethod === "oauth");

  const offlineDevices = devices.filter((d) => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return d.lastSeenAt.getTime() < fiveMinAgo;
  });

  const misconfigured = installations.filter((t) => t.detected && !t.configured);

  const quotas = await prisma.quotaSnapshot.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const nearLimit = quotas.filter((q) => (q.usedPercent || 0) >= 80);

  return NextResponse.json({
    enrolled: devices.length,
    notInstalled: notInstalled.map((u) => ({ name: u.name, email: u.email })),
    detected: installations.filter((t) => t.detected).length,
    configured: installations.filter((t) => t.configured).length,
    misconfigured,
    offlineDevices: offlineDevices.map((d) => ({ hostname: d.hostname, lastSeenAt: d.lastSeenAt })),
    bypassSuspects,
    personalAccounts,
    nearLimitQuotas: nearLimit,
  });
}
