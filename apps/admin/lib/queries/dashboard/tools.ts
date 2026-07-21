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
    inputTokens: number;
    outputTokens: number;
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

type LatestQuotaRow = {
  tool_name: string;
  window_type: string;
  used_percent: number | null;
  reset_at: Date | null;
  device_hostname: string | null;
  developer_name: string | null;
};

async function readLatestQuotas(orgId: string): Promise<LatestQuotaRow[]> {
  // DISTINCT ON keeps the newest row per tool/window/device — matches prior JS dedupe.
  return prisma.$queryRaw<LatestQuotaRow[]>`
    SELECT DISTINCT ON (qs.tool_name, qs.window_type, qs.device_id)
      qs.tool_name,
      qs.window_type,
      qs.used_percent,
      qs.reset_at,
      d.hostname AS device_hostname,
      u.name AS developer_name
    FROM quota_snapshots qs
    LEFT JOIN devices d ON d.id = qs.device_id
    LEFT JOIN users u ON u.id = d.user_id
    WHERE qs.org_id = ${orgId}
    ORDER BY qs.tool_name, qs.window_type, qs.device_id, qs.updated_at DESC
  `;
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
    readLatestQuotas(orgId),
  ]);

  const configuredMap = new Map(configured.map((c) => [c.toolName, c._count.id]));
  const activityMap = new Map<
    string,
    { requests: number; cost: number; tokens: number; inputTokens: number; outputTokens: number }
  >();
  for (const row of usageRows.data.rows) {
    const toolName = dimension(row, "tool") || "unknown";
    const current = activityMap.get(toolName) ?? {
      requests: 0,
      cost: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    const cost = summarizeCanonicalCosts([{
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    }]);
    const inputTokens = metricNumber(row, "inputTokens");
    const outputTokens = metricNumber(row, "outputTokens");
    current.requests += metricNumber(row, "requests");
    current.cost += cost.totalUsageCost;
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.tokens += inputTokens + outputTokens;
    activityMap.set(toolName, current);
  }

  const quotasByTool = new Map<string, DashboardToolsData["tools"][number]["quotas"]>();

  for (const quota of quotas) {
    const list = quotasByTool.get(quota.tool_name) ?? [];
    list.push({
      toolName: quota.tool_name,
      windowType: quota.window_type,
      usedPercent: quota.used_percent,
      resetAt: quota.reset_at,
      deviceHostname: quota.device_hostname,
      developerName: quota.developer_name,
    });
    quotasByTool.set(quota.tool_name, list);
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
          ...(activityMap.get(toolName) ?? {
            requests: 0,
            cost: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
          }),
          quotas: quotasByTool.get(toolName) ?? [],
        };
      })
      .filter((tool) => tool.installedOn > 0 || tool.requests > 0 || tool.evidence.length > 0 || tool.quotas.length > 0)
      .sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName)),
  };
}
