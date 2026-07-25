import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { readOrgUsageFromSnapshots } from "@/lib/analytics/snapshots";
import { usageWindowDays } from "@/lib/metrics/date-range";

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

export async function getDashboardUsage(
  orgId: string,
  daysOrWindow: number | MetricWindow = 30,
): Promise<DashboardUsageData> {
  const window: MetricWindow =
    typeof daysOrWindow === "number"
      ? {
          ...usageWindowDays(Math.min(daysOrWindow, 90)),
          timezone: UTC_TIMEZONE,
          grain: "day",
        }
      : daysOrWindow;

  const snapshot = await readOrgUsageFromSnapshots(orgId, window, {
    includeTools: true,
    includeModels: true,
    ensure: false,
  });

  const byModel: DashboardUsageData["byModel"] = [];
  const productivityModels: DashboardUsageData["productivityModels"] = [];

  for (const row of snapshot.models) {
    // Org activity uses org-level model grains (developerId "").
    if (row.developerId !== "") continue;
    const cost = row.verifiedUsageCost + row.estimatedApiCost;
    const hasUsage =
      row.requests > 0 || row.inputTokens > 0 || row.outputTokens > 0 || cost > 0;
    if (hasUsage) {
      byModel.push({
        model: row.modelName || "unknown",
        toolName: row.toolName || "unknown",
        requests: row.requests,
        tokens: row.inputTokens + row.outputTokens,
        cost,
        source: row.verifiedUsageCost > 0 ? "vendor_verified" : "device_observed",
        verified: row.verifiedUsageCost > 0,
        costKind:
          row.verifiedUsageCost > 0
            ? "verified_usage"
            : cost > 0
              ? "estimated_api"
              : null,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        reasoningTokens: row.reasoningTokens,
      });
    }
    if (
      row.suggestedLines ||
      row.acceptedLines ||
      row.addedLines ||
      row.deletedLines ||
      row.commits
    ) {
      productivityModels.push({
        toolName: row.toolName || "unknown",
        model: row.modelName || "unknown",
        source: "device_observed",
        suggestedLines: row.suggestedLines,
        acceptedLines: row.acceptedLines,
        addedLines: row.addedLines,
        deletedLines: row.deletedLines,
        commits: row.commits,
      });
    }
  }

  byModel.sort(
    (a, b) => b.cost - a.cost || b.requests - a.requests || (a.model ?? "").localeCompare(b.model ?? ""),
  );
  productivityModels.sort(
    (a, b) => b.acceptedLines - a.acceptedLines || a.model.localeCompare(b.model),
  );

  const { kpis } = snapshot;
  return {
    byModel,
    productivityModels,
    byTool: snapshot.tools.map((row) => ({
      toolName: row.toolName || "unknown",
      requests: row.requests,
      tokens: row.tokens,
      cost: row.cost,
    })),
    byDay: snapshot.dayTotals.map((row) => ({
      date: row.date,
      requests: row.requests,
      tokens: row.inputTokens + row.outputTokens,
      cost: row.verifiedUsageCost + row.estimatedApiCost,
    })),
    kpis: {
      modelCalls: kpis.modelCalls,
      sessions: kpis.sessions,
      verifiedUsageCost: kpis.verifiedUsageCost,
      estimatedApiCost: kpis.estimatedApiCost,
      actualSpendCost: kpis.actualSpendCost,
      totalUsageCost: kpis.verifiedUsageCost + kpis.estimatedApiCost + kpis.actualSpendCost,
      inputTokens: kpis.inputTokens,
      outputTokens: kpis.outputTokens,
      cacheReadTokens: kpis.cacheReadTokens,
      cacheWriteTokens: kpis.cacheWriteTokens,
      reasoningTokens: kpis.reasoningTokens,
      suggestedLines: kpis.suggestedLines,
      acceptedLines: kpis.acceptedLines,
      addedLines: kpis.addedLines,
      deletedLines: kpis.deletedLines,
      commits: kpis.commits,
      partialData: kpis.partialData,
    },
  };
}
