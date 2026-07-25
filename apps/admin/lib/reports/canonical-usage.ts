import { UTC_TIMEZONE, type MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  readDeveloperUsageFromSnapshots,
  readOrgUsageFromSnapshots,
} from "@/lib/analytics/snapshots";
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
 * Report usage from sealed org/developer day snapshots (same source-priority
 * accounting as the dashboard). Never sums raw usage_daily rows.
 */
export async function readCanonicalReportUsage(input: {
  orgId: string;
  developerId?: string | null;
  fromLocalDate: string;
  toLocalDate: string;
}): Promise<CanonicalReportUsage> {
  const window = metricWindow(input.fromLocalDate, input.toLocalDate);
  const developerId = input.developerId?.trim() || null;

  const snapshot = developerId
    ? await readDeveloperUsageFromSnapshots(input.orgId, developerId, window, {
        includeTools: true,
        ensure: false,
      })
    : await readOrgUsageFromSnapshots(input.orgId, window, {
        includeTools: true,
        ensure: false,
      });

  const requests = snapshot.kpis.modelCalls;
  const tokens = snapshot.kpis.tokens;
  const verifiedUsageCost = snapshot.kpis.verifiedUsageCost;
  const estimatedApiCost = snapshot.kpis.estimatedApiCost;
  const cost = verifiedUsageCost + estimatedApiCost;
  const activeDevelopers = snapshot.activeDevelopers;

  const byTool = new Map<string, CanonicalReportToolRow>();
  for (const row of snapshot.tools) {
    const key = canonicalToolKey(row.toolName);
    const existing = byTool.get(key) ?? {
      toolName: key,
      displayName: toolDisplayName(key),
      requests: 0,
      tokens: 0,
      cost: 0,
      sharePercent: 0,
      tokenSharePercent: 0,
    };
    existing.requests += row.requests;
    existing.tokens += row.tokens;
    existing.cost += row.cost;
    byTool.set(key, existing);
  }

  const byDay = new Map<string, CanonicalDayTotals>();
  for (const row of snapshot.dayTotals) {
    byDay.set(row.date, {
      tokens: row.inputTokens + row.outputTokens,
      cost: row.verifiedUsageCost + row.estimatedApiCost,
      requests: row.requests,
    });
  }

  return {
    requests,
    tokens,
    cost,
    verifiedUsageCost,
    estimatedApiCost,
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
