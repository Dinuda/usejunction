import { prisma } from "@usejunction/db";

export interface DashboardToolsData {
  tools: Array<{
    toolName: string;
    installedOn: number;
    configuredOn: number;
    evidence: Array<{ source: string; developers: number }>;
    requests7d: number;
    cost7d: number;
    tokens7d: number;
  }>;
}

export async function getDashboardTools(orgId: string): Promise<DashboardToolsData> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [installations, configured, activity, claims] = await Promise.all([
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId },
      _count: { id: true },
    }),
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, configured: true },
      _count: { id: true },
    }),
    prisma.requestMetadata.groupBy({
      by: ["toolName"],
      where: { orgId, createdAt: { gte: since7d }, toolName: { not: null } },
      _count: { id: true },
      _sum: { estimatedCost: true, totalTokens: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.developerToolClaim.groupBy({
      by: ["toolName", "source"],
      where: { orgId, enabled: true },
      _count: { id: true },
    }),
  ]);

  const configuredMap = new Map(configured.map((c) => [c.toolName, c._count.id]));
  const activityMap = new Map(
    activity.map((a) => [
      a.toolName,
      {
        requests7d: a._count.id,
        cost7d: a._sum.estimatedCost ?? 0,
        tokens7d: a._sum.totalTokens ?? 0,
      },
    ])
  );

  const allToolNames = new Set(
    [
      ...installations.map((i) => i.toolName),
      ...activity.map((a) => a.toolName ?? ""),
      ...claims.map((claim) => claim.toolName),
    ].filter(Boolean)
  );

  return {
    tools: Array.from(allToolNames)
      .map((toolName) => {
        const inst = installations.find((i) => i.toolName === toolName);
        return {
          toolName,
          installedOn: inst?._count.id ?? 0,
          configuredOn: configuredMap.get(toolName) ?? 0,
          evidence: claims
            .filter((claim) => claim.toolName === toolName)
            .map((claim) => ({ source: claim.source, developers: claim._count.id })),
          ...(activityMap.get(toolName) ?? { requests7d: 0, cost7d: 0, tokens7d: 0 }),
        };
      })
      .sort((a, b) => b.requests7d - a.requests7d),
  };
}
