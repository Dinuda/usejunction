import { prisma } from "@usejunction/db";
import { usageWindowDays } from "@/lib/metrics/date-range";
import { fetchUsageRows, groupByTool } from "@/lib/metrics/model-usage";

export interface DashboardToolsData {
  tools: Array<{
    toolName: string;
    installedOn: number;
    configuredOn: number;
    evidence: Array<{ source: string; developers: number }>;
    requests7d: number;
    cost7d: number;
    tokens7d: number;
    quotas: Array<{
      toolName: string;
      windowType: string;
      usedPercent: number | null;
      resetAt: Date | null;
      deviceHostname: string | null;
      developerName: string | null;
    }>;
  }>;
}

export async function getDashboardTools(orgId: string): Promise<DashboardToolsData> {
  const usage7d = usageWindowDays(7);

  const [installations, configured, usageRows, claims, quotas] = await Promise.all([
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, detected: true },
      _count: { id: true },
    }),
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, detected: true, configured: true },
      _count: { id: true },
    }),
    fetchUsageRows({ orgId, from: usage7d.from, to: usage7d.to }),
    prisma.developerToolClaim.groupBy({
      by: ["toolName", "source"],
      where: { orgId, enabled: true },
      _count: { id: true },
    }),
    prisma.quotaSnapshot.findMany({
      where: { orgId },
      include: {
        device: {
          select: {
            hostname: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const configuredMap = new Map(configured.map((c) => [c.toolName, c._count.id]));
  const activityMap = new Map(
    groupByTool(usageRows).map((row) => [
      row.toolName,
      { requests7d: row.modelCalls, cost7d: row.cost, tokens7d: row.tokens },
    ]),
  );

  const quotasByTool = new Map<string, DashboardToolsData["tools"][number]["quotas"]>();

  for (const quota of quotas) {
    const list = quotasByTool.get(quota.toolName) ?? [];
    const already = list.some(
      (item) =>
        item.windowType === quota.windowType &&
        item.deviceHostname === (quota.device?.hostname ?? null),
    );
    if (already) continue;
    list.push({
      toolName: quota.toolName,
      windowType: quota.windowType,
      usedPercent: quota.usedPercent,
      resetAt: quota.resetAt,
      deviceHostname: quota.device?.hostname ?? null,
      developerName: quota.device?.user?.name ?? null,
    });
    quotasByTool.set(quota.toolName, list);
  }

  const allToolNames = new Set(
    [
      ...installations.map((i) => i.toolName),
      ...activityMap.keys(),
      ...claims.map((claim) => claim.toolName),
      ...quotasByTool.keys(),
    ].filter(Boolean),
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
          quotas: quotasByTool.get(toolName) ?? [],
        };
      })
      .filter((tool) => tool.installedOn > 0 || tool.requests7d > 0 || tool.evidence.length > 0 || tool.quotas.length > 0)
      .sort((a, b) => b.requests7d - a.requests7d || a.toolName.localeCompare(b.toolName)),
  };
}
