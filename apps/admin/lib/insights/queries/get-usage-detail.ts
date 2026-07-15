import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { UsageDetailInput, UsageDetailV1 } from "@/lib/insights/contracts/usage-detail.v1";
import {
  aggregateModelUsage,
  aggregateUsageKpis,
  groupByDay,
  groupByModel,
  groupByTool,
} from "@/lib/metrics/model-usage";

export async function getUsageDetail(
  context: InsightContext,
  input: UsageDetailInput,
): Promise<InsightEnvelope<UsageDetailV1>> {
  assertInsightRoles(context, ["owner", "admin", "developer"]);

  if (context.roles.includes("developer") && !context.roles.some((r) => r === "owner" || r === "admin")) {
    if (!input.developerId) throw new Error("FORBIDDEN");
  }

  const metrics = createUsageMetricsStore();
  const [rows, dataThrough] = await Promise.all([
    metrics.activityRows({
      orgId: context.orgId,
      window: input.reportWindow,
      developerId: input.developerId,
    }),
    metrics.dataThrough(context.orgId),
  ]);

  const kpis = aggregateUsageKpis(rows);
  const { productivity } = aggregateModelUsage(rows);
  const byModel = groupByModel(rows);
  const byTool = groupByTool(rows).map((row) => ({
    toolName: row.toolName,
    requests: row.modelCalls,
    tokens: row.tokens,
    cost: row.cost,
  }));
  const byDay = groupByDay(rows).map((row) => ({
    date: row.date,
    requests: row.modelCalls,
    tokens: 0,
    cost: row.cost,
  }));

  const data: UsageDetailV1 = {
    byModel,
    productivityModels: productivity.map((row) => ({
      toolName: row.toolName,
      model: row.model,
      source: row.source,
      suggestedLines: row.suggestedLines,
      acceptedLines: row.acceptedLines,
      addedLines: row.addedLines,
      deletedLines: row.deletedLines,
      commits: row.commits,
    })),
    byTool,
    byDay,
    kpis,
  };

  return makeInsightEnvelope({
    context,
    kind: "usage-detail",
    window: input.reportWindow,
    dataThrough,
    data,
  });
}
