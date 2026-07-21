import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  ensureOrgUsageDaySnapshots,
  snapshotIsoDay,
  snapshotUtcDay,
} from "./materialize";

export type SnapshotDayTotals = {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  actualSpendCost: number;
  activeDevelopers: number;
  activeDeveloperIds: string[];
  dataThrough: Date | null;
};

export type SnapshotToolTotals = {
  toolName: string;
  requests: number;
  cost: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  activeDevelopers: number;
};

export type SnapshotToolDay = {
  date: string;
  toolName: string;
  requests: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
};

function microsToDollars(value: bigint | number) {
  return Number(value) / 1_000_000;
}

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

/**
 * Sum ready org-day snapshots for a window.
 * Callers that need multiple windows should call `ensureOrgUsageDaySnapshots`
 * once for the union range first, then pass `{ ensure: false }` here.
 */
export async function readOrgUsageFromSnapshots(
  orgId: string,
  window: MetricWindow,
  options: { includeTools?: boolean; toolNames?: string[]; ensure?: boolean } = {},
): Promise<{
  dataThrough: Date | null;
  kpis: {
    modelCalls: number;
    tokens: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    partialData: boolean;
  };
  trend: Array<{ date: string; modelCalls: number; cost: number }>;
  tools: SnapshotToolTotals[];
  activeDevelopers: number;
  toolDays: SnapshotToolDay[];
  dayTotals: SnapshotDayTotals[];
}> {
  if (options.ensure !== false) {
    await ensureOrgUsageDaySnapshots(orgId, window.from, window.to);
  }

  const from = snapshotUtcDay(window.from);
  const to = snapshotUtcDay(window.to);
  const rows = await prisma.orgUsageDaySnapshot.findMany({
    where: {
      orgId,
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      date: { gte: from, lte: to },
      ...(options.toolNames?.length
        ? { OR: [{ toolName: "" }, { toolName: { in: options.toolNames } }] }
        : {}),
    },
    orderBy: [{ date: "asc" }, { toolName: "asc" }],
  });

  const dayTotals: SnapshotDayTotals[] = [];
  const toolAcc = new Map<string, SnapshotToolTotals>();
  const toolDays: SnapshotToolDay[] = [];
  const windowDeveloperIds = new Set<string>();
  let dataThrough: Date | null = null;

  for (const row of rows) {
    const date = snapshotIsoDay(row.date);
    const verified = microsToDollars(row.verifiedUsageCostMicros);
    const estimated = microsToDollars(row.estimatedApiCostMicros);
    if (row.sourceObservedThrough && (!dataThrough || row.sourceObservedThrough > dataThrough)) {
      dataThrough = row.sourceObservedThrough;
    }

    if (row.toolName === "") {
      const ids = parseIds(row.activeDeveloperIds);
      for (const id of ids) windowDeveloperIds.add(id);
      dayTotals.push({
        date,
        requests: row.requests,
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        verifiedUsageCost: verified,
        estimatedApiCost: estimated,
        actualSpendCost: microsToDollars(row.actualSpendCostMicros),
        activeDevelopers: row.activeDevelopers,
        activeDeveloperIds: ids,
        dataThrough: row.sourceObservedThrough,
      });
      continue;
    }

    if (options.toolNames?.length && !options.toolNames.includes(row.toolName)) continue;

    toolDays.push({
      date,
      toolName: row.toolName,
      requests: row.requests,
      verifiedUsageCost: verified,
      estimatedApiCost: estimated,
    });

    if (options.includeTools) {
      const existing = toolAcc.get(row.toolName) ?? {
        toolName: row.toolName,
        requests: 0,
        cost: 0,
        verifiedUsageCost: 0,
        estimatedApiCost: 0,
        activeDevelopers: 0,
      };
      existing.requests += row.requests;
      existing.verifiedUsageCost += verified;
      existing.estimatedApiCost += estimated;
      existing.cost += verified + estimated;
      // Window-level active developers for a tool: track via ids if present
      existing.activeDevelopers = Math.max(existing.activeDevelopers, row.activeDevelopers);
      toolAcc.set(row.toolName, existing);
    }
  }

  // Better tool activeDevelopers: union ids across days when available
  if (options.includeTools) {
    const toolDevIds = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.toolName === "") continue;
      if (options.toolNames?.length && !options.toolNames.includes(row.toolName)) continue;
      const set = toolDevIds.get(row.toolName) ?? new Set<string>();
      for (const id of parseIds(row.activeDeveloperIds)) set.add(id);
      toolDevIds.set(row.toolName, set);
    }
    for (const [toolName, ids] of toolDevIds) {
      const tool = toolAcc.get(toolName);
      if (tool && ids.size > 0) tool.activeDevelopers = ids.size;
    }
  }

  const kpis = {
    modelCalls: dayTotals.reduce((sum, row) => sum + row.requests, 0),
    tokens: dayTotals.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0),
    verifiedUsageCost: dayTotals.reduce((sum, row) => sum + row.verifiedUsageCost, 0),
    estimatedApiCost: dayTotals.reduce((sum, row) => sum + row.estimatedApiCost, 0),
    partialData: false,
  };

  return {
    dataThrough,
    kpis,
    trend: dayTotals.map((row) => ({
      date: row.date,
      modelCalls: row.requests,
      cost: row.verifiedUsageCost + row.estimatedApiCost,
    })),
    tools: options.includeTools ? [...toolAcc.values()] : [],
    activeDevelopers: windowDeveloperIds.size,
    toolDays,
    dayTotals,
  };
}
