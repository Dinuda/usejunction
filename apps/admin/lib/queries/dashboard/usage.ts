import {
  aggregateModelUsage,
  aggregateUsageKpis,
  fetchUsageRows,
  groupByDay,
  groupByModel,
  groupByTool,
} from "@/lib/metrics/model-usage";
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
  kpis: ReturnType<typeof aggregateUsageKpis>;
}

export async function getDashboardUsage(orgId: string, days = 30): Promise<DashboardUsageData> {
  const cappedDays = Math.min(days, 90);
  const window = usageWindowDays(cappedDays);
  const rows = await fetchUsageRows({ orgId, from: window.from, to: window.to });
  const kpis = aggregateUsageKpis(rows);
  const { usage, productivity } = aggregateModelUsage(rows);
  const byModel = groupByModel(rows);
  const byTool = groupByTool(rows).map((row) => ({
    toolName: row.toolName,
    requests: row.modelCalls,
    tokens: 0,
    cost: row.cost,
  }));
  const byDay = groupByDay(rows).map((row) => ({
    date: row.date,
    requests: row.modelCalls,
    tokens: 0,
    cost: row.cost,
  }));

  return {
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
}
