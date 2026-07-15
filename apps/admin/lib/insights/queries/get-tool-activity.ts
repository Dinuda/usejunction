import { prisma } from "@usejunction/db";
import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { ToolActivityInput, ToolActivityV1 } from "@/lib/insights/contracts/tool-activity.v1";
import { groupByTool } from "@/lib/metrics/model-usage";

export async function getToolActivity(
  context: InsightContext,
  input: ToolActivityInput,
): Promise<InsightEnvelope<ToolActivityV1>> {
  assertInsightRoles(context, ["owner", "admin"]);

  const metrics = createUsageMetricsStore();
  const [installations, configured, usageRows, claims, quotas, dataThrough] = await Promise.all([
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId: context.orgId, detected: true },
      _count: { id: true },
    }),
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId: context.orgId, detected: true, configured: true },
      _count: { id: true },
    }),
    metrics.activityRows({ orgId: context.orgId, window: input.reportWindow }),
    prisma.developerToolClaim.groupBy({
      by: ["toolName", "source"],
      where: { orgId: context.orgId, enabled: true },
      _count: { id: true },
    }),
    prisma.quotaSnapshot.findMany({
      where: { orgId: context.orgId },
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
    metrics.dataThrough(context.orgId),
  ]);

  const configuredMap = new Map(configured.map((c) => [c.toolName, c._count.id]));
  const activityMap = new Map(
    groupByTool(usageRows).map((row) => [
      row.toolName,
      { requests: row.modelCalls, cost: row.cost, tokens: row.tokens },
    ]),
  );

  const quotasByTool = new Map<string, ToolActivityV1["tools"][number]["quotas"]>();
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

  const data: ToolActivityV1 = {
    tools: Array.from(allToolNames)
      .map((toolName) => {
        const inst = installations.find((i) => i.toolName === toolName);
        const activity = activityMap.get(toolName);
        const evidence = claims
          .filter((claim) => claim.toolName === toolName)
          .map((claim) => ({ source: claim.source, developers: claim._count.id }));
        return {
          toolName,
          installedOn: inst?._count.id ?? 0,
          configuredOn: configuredMap.get(toolName) ?? 0,
          evidence,
          requests: activity?.requests ?? 0,
          cost: activity?.cost ?? 0,
          tokens: activity?.tokens ?? 0,
          quotas: quotasByTool.get(toolName) ?? [],
        };
      })
      .sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName)),
  };

  return makeInsightEnvelope({
    context,
    kind: "tool-activity",
    window: input.reportWindow,
    dataThrough,
    data,
  });
}
