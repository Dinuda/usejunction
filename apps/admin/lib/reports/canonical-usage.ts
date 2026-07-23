import { UTC_TIMEZONE, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";
import { utcDateOnly } from "@/lib/metrics/date-range";
import { canonicalToolKey, toolDisplayName } from "@/lib/tools/catalog";

export type CanonicalReportToolRow = {
  toolName: string;
  displayName: string;
  requests: number;
  tokens: number;
  cost: number;
  sharePercent: number;
  tokenSharePercent: number;
};

export type CanonicalDayTotals = {
  tokens: number;
  cost: number;
  requests: number;
};

export type CanonicalReportUsage = {
  requests: number;
  tokens: number;
  cost: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  tools: number;
  topTools: CanonicalReportToolRow[];
  byDay: Map<string, CanonicalDayTotals>;
  activeDevelopers: number;
};

function metricWindow(fromLocalDate: string, toLocalDate: string): MetricWindow {
  return {
    from: utcDateOnly(new Date(`${fromLocalDate}T00:00:00.000Z`)),
    to: utcDateOnly(new Date(`${toLocalDate}T00:00:00.000Z`)),
    timezone: UTC_TIMEZONE,
    grain: "day",
  };
}

function finishTopTools(
  byTool: Map<string, CanonicalReportToolRow>,
  tokens: number,
  cost: number,
): CanonicalReportToolRow[] {
  const topTools = [...byTool.values()]
    .sort(
      (a, b) =>
        b.tokens - a.tokens ||
        b.cost - a.cost ||
        b.requests - a.requests,
    )
    .slice(0, 6);
  for (const tool of topTools) {
    tool.sharePercent = cost > 0 ? (tool.cost / cost) * 100 : 0;
    tool.tokenSharePercent = tokens > 0 ? (tool.tokens / tokens) * 100 : 0;
  }
  return topTools;
}

/**
 * Report usage with the same source-priority accounting as the dashboard
 * (`USAGE_ACCOUNTING_POLICY_VERSION = source-priority-v1`).
 *
 * Never sum raw usageDaily rows — that double-counts vendor + device sources.
 */
export async function readCanonicalReportUsage(input: {
  orgId: string;
  developerId?: string | null;
  fromLocalDate: string;
  toLocalDate: string;
}): Promise<CanonicalReportUsage> {
  const window = metricWindow(input.fromLocalDate, input.toLocalDate);
  const developerId = input.developerId ?? undefined;

  const [summary, costs, tools, days] = await Promise.all([
    readUsageMetrics({
      orgId: input.orgId,
      developerId,
      window,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros", "activeDevelopers"],
      limit: 1,
    }),
    readUsageMetrics({
      orgId: input.orgId,
      developerId,
      window,
      measures: ["costMicros"],
      dimensions: ["costKind"],
    }),
    readUsageMetrics({
      orgId: input.orgId,
      developerId,
      window,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
      dimensions: ["tool"],
    }),
    readUsageMetrics({
      orgId: input.orgId,
      developerId,
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

  const requests = metricNumber(summaryRow, "requests");
  const tokens =
    metricNumber(summaryRow, "inputTokens") + metricNumber(summaryRow, "outputTokens");
  // Match dashboard "Estimated usage" = verified + estimated (not seat commitment).
  const cost = costSummary.verifiedUsageCost + costSummary.estimatedApiCost;
  const activeDevelopers = metricNumber(summaryRow, "activeDevelopers");

  const byTool = new Map<string, CanonicalReportToolRow>();
  for (const row of tools.data.rows) {
    const rawName = dimension(row, "tool") || "unknown";
    const key = canonicalToolKey(rawName);
    const rowTokens = metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens");
    const rowCost = metricNumber(row, "costMicros") / 1_000_000;
    const existing = byTool.get(key) ?? {
      toolName: key,
      displayName: toolDisplayName(key),
      requests: 0,
      tokens: 0,
      cost: 0,
      sharePercent: 0,
      tokenSharePercent: 0,
    };
    existing.requests += metricNumber(row, "requests");
    existing.tokens += rowTokens;
    existing.cost += rowCost;
    byTool.set(key, existing);
  }

  const byDay = new Map<string, CanonicalDayTotals>();
  for (const row of days.data.rows) {
    const date = dimension(row, "day");
    if (!date) continue;
    byDay.set(date, {
      tokens: metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
      requests: metricNumber(row, "requests"),
    });
  }

  return {
    requests,
    tokens,
    cost,
    verifiedUsageCost: costSummary.verifiedUsageCost,
    estimatedApiCost: costSummary.estimatedApiCost,
    tools: byTool.size,
    topTools: finishTopTools(byTool, tokens, cost),
    byDay,
    activeDevelopers,
  };
}

/** Slice a by-day map to an inclusive local-date range (copy). */
export function sliceDayTotals(
  byDay: Map<string, CanonicalDayTotals>,
  fromLocalDate: string,
  toLocalDate: string,
): Map<string, CanonicalDayTotals> {
  const out = new Map<string, CanonicalDayTotals>();
  for (const [date, totals] of byDay) {
    if (date >= fromLocalDate && date <= toLocalDate) {
      out.set(date, { ...totals });
    }
  }
  return out;
}
