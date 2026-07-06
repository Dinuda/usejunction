import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: { orgId },
    include: {
      devices: {
        include: {
          toolInstallations: true,
          localModels: true,
          toolAccounts: true,
          quotaSnapshots: { orderBy: { updatedAt: "desc" }, take: 5 },
        },
      },
      requestMetadata: { where: { createdAt: { gte: today } } },
      localUsageAggregates: { where: { date: { gte: today } } },
    },
  });

  const developers = users.map((u) => {
    const usageToday = u.requestMetadata.reduce((s, r) => s + r.estimatedCost, 0);
    const localToday = u.localUsageAggregates.reduce((s, a) => s + a.estimatedCost, 0);
    const bypassSuspect = localToday > usageToday * 1.5 && localToday > 0.01;

    const models = u.requestMetadata.map((r) => r.model).filter(Boolean);
    const mostUsedModel = models.length
      ? models.sort((a, b) => models.filter((m) => m === b).length - models.filter((m) => m === a).length)[0]
      : null;

    const lastSeen = u.devices.reduce(
      (max, d) => (d.lastSeenAt > max ? d.lastSeenAt : max),
      new Date(0)
    );

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      team: u.teamId,
      devices: u.devices.map((d) => ({
        id: d.id,
        hostname: d.hostname,
        status: d.status,
        tools: d.toolInstallations,
        accounts: d.toolAccounts,
        quotas: d.quotaSnapshots,
      })),
      usageToday,
      localScanToday: localToday,
      bypassSuspect,
      mostUsedModel,
      lastSeen: lastSeen.getTime() > 0 ? lastSeen : null,
      localModels: u.devices.flatMap((d) => d.localModels),
    };
  });

  return NextResponse.json({ developers });
}
