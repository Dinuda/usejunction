import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import { usageWindowDays } from "@/lib/metrics/date-range";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";

export interface DashboardUsageData {
  byModel: Array<{
    model: string | null;
    toolName: string;
    requests: number;
    tokens: number;
    cost: number;
    source: string;
    verified: boolean;
    costKind: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
  }>;
  productivityModels: Array<{
    toolName: string;
    model: string;
    source: string;
    suggestedLines: number;
    acceptedLines: number;
    addedLines: number;
    deletedLines: number;
    commits: number;
  }>;
  byTool: Array<{ toolName: string | null; requests: number; tokens: number; cost: number }>;
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  kpis: {
    modelCalls: number;
    sessions: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    actualSpendCost: number;
    totalUsageCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    suggestedLines: number;
    acceptedLines: number;
    addedLines: number;
    deletedLines: number;
    commits: number;
    partialData: boolean;
  };
}

const usageMeasures = [
  "requests",
  "sessions",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "suggestedLines",
  "acceptedLines",
  "addedLines",
  "deletedLines",
  "commits",
  "costMicros",
] as const;

export async function getDashboardUsage(
  orgId: string,
  daysOrWindow: number | MetricWindow = 30,
): Promise<DashboardUsageData> {
  const window =
    typeof daysOrWindow === "number" ? usageWindowDays(Math.min(daysOrWindow, 90)) : daysOrWindow;
  const [summary, costs, models, tools, trend] = await Promise.all([
    readUsageMetrics({ orgId, window, measures: [...usageMeasures], limit: 1 }),
    readUsageMetrics({ orgId, window, measures: ["costMicros"], dimensions: ["source", "costKind"] }),
    readUsageMetrics({ orgId, window, measures: [...usageMeasures], dimensions: ["tool", "model", "source"] }),
    readUsageMetrics({
      orgId,
      window,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
      dimensions: ["tool"],
    }),
    readUsageMetrics({
      orgId,
      window,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
      dimensions: ["day"],
    }),
  ]);

  const summaryRow = summary.data.rows[0];
  const costSummary = summarizeCanonicalCosts(
    costs.data.rows.map((row) => ({
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    })),
  );

  const byModel: DashboardUsageData["byModel"] = [];
  const productivityModels: DashboardUsageData["productivityModels"] = [];
  for (const row of models.data.rows) {
    const toolName = dimension(row, "tool") || "unknown";
    const model = dimension(row, "model") || "unknown";
    const source = dimension(row, "source");
    const requests = metricNumber(row, "requests");
    const inputTokens = metricNumber(row, "inputTokens");
    const outputTokens = metricNumber(row, "outputTokens");
    const cost = metricNumber(row, "costMicros") / 1_000_000;
    const suggestedLines = metricNumber(row, "suggestedLines");
    const acceptedLines = metricNumber(row, "acceptedLines");
    const addedLines = metricNumber(row, "addedLines");
    const deletedLines = metricNumber(row, "deletedLines");
    const commits = metricNumber(row, "commits");

    if (requests || inputTokens || outputTokens || cost) {
      byModel.push({
        model,
        toolName,
        requests,
        tokens: inputTokens + outputTokens,
        cost,
        source,
        verified: source === "vendor_verified",
        costKind: source === "vendor_verified" ? "verified_usage" : cost > 0 ? "estimated_api" : null,
        inputTokens,
        outputTokens,
        cacheReadTokens: metricNumber(row, "cacheReadTokens"),
        cacheWriteTokens: metricNumber(row, "cacheWriteTokens"),
        reasoningTokens: metricNumber(row, "reasoningTokens"),
      });
    }
    if (suggestedLines || acceptedLines || addedLines || deletedLines || commits) {
      productivityModels.push({
        toolName,
        model,
        source,
        suggestedLines,
        acceptedLines,
        addedLines,
        deletedLines,
        commits,
      });
    }
  }

  byModel.sort((a, b) => b.cost - a.cost || b.requests - a.requests || a.model!.localeCompare(b.model!));
  productivityModels.sort((a, b) => b.acceptedLines - a.acceptedLines || a.model.localeCompare(b.model));

  return {
    byModel,
    productivityModels,
    byTool: tools.data.rows.map((row) => ({
      toolName: dimension(row, "tool") || "unknown",
      requests: metricNumber(row, "requests"),
      tokens: metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
    })),
    byDay: trend.data.rows.map((row) => ({
      date: dimension(row, "day"),
      requests: metricNumber(row, "requests"),
      tokens: metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
    })),
    kpis: {
      modelCalls: metricNumber(summaryRow, "requests"),
      sessions: metricNumber(summaryRow, "sessions"),
      verifiedUsageCost: costSummary.verifiedUsageCost,
      estimatedApiCost: costSummary.estimatedApiCost,
      actualSpendCost: costSummary.actualSpendCost,
      totalUsageCost: costSummary.totalUsageCost,
      inputTokens: metricNumber(summaryRow, "inputTokens"),
      outputTokens: metricNumber(summaryRow, "outputTokens"),
      cacheReadTokens: metricNumber(summaryRow, "cacheReadTokens"),
      cacheWriteTokens: metricNumber(summaryRow, "cacheWriteTokens"),
      reasoningTokens: metricNumber(summaryRow, "reasoningTokens"),
      suggestedLines: metricNumber(summaryRow, "suggestedLines"),
      acceptedLines: metricNumber(summaryRow, "acceptedLines"),
      addedLines: metricNumber(summaryRow, "addedLines"),
      deletedLines: metricNumber(summaryRow, "deletedLines"),
      commits: metricNumber(summaryRow, "commits"),
      partialData: false,
    },
  };
}
