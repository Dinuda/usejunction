import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveReportWindow } from "@/lib/analytics/contracts/time-window";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";

export interface DashboardToolsData {
  tools: Array<{
    toolName: string;
    installedOn: number;
    configuredOn: number;
    evidence: Array<{ source: string; developers: number }>;
    requests: number;
    cost: number;
    tokens: number;
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

export async function getDashboardTools(
  orgId: string,
  reportWindow: MetricWindow = resolveReportWindow({ range: 30 }),
): Promise<DashboardToolsData> {
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
    readUsageMetrics({
      orgId,
      window: reportWindow,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
      dimensions: ["tool", "costKind"],
    }),
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
  const activityMap = new Map<string, { requests: number; cost: number; tokens: number }>();
  for (const row of usageRows.data.rows) {
    const toolName = dimension(row, "tool") || "unknown";
    const current = activityMap.get(toolName) ?? { requests: 0, cost: 0, tokens: 0 };
    const cost = summarizeCanonicalCosts([{
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    }]);
    current.requests += metricNumber(row, "requests");
    current.cost += cost.totalUsageCost;
    current.tokens += metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens");
    activityMap.set(toolName, current);
  }

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
          ...(activityMap.get(toolName) ?? { requests: 0, cost: 0, tokens: 0 }),
          quotas: quotasByTool.get(toolName) ?? [],
        };
      })
      .filter((tool) => tool.installedOn > 0 || tool.requests > 0 || tool.evidence.length > 0 || tool.quotas.length > 0)
      .sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName)),
  };
}
