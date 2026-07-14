import { prisma, type Prisma } from "@usejunction/db";
import { usageDayFilter } from "@/lib/metrics/date-range";
import {
  activityPriority,
  costKindForRow,
  costPriority,
  isProductivityMetric,
  normalizeSource,
} from "@/lib/metrics/source-priority";

type UsageRow = {
  date: Date;
  developerId: string | null;
  toolName: string;
  model: string;
  provider: string;
  source: string;
  verified: boolean;
  requests: number;
  sessions: number;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens?: bigint;
  reasoningTokens?: bigint;
  suggestedLines: bigint;
  acceptedLines: bigint;
  addedLines: bigint;
  deletedLines: bigint;
  commits: number;
  costMicros: bigint;
  metricKind?: string | null;
  costKind?: string | null;
  metadata: Prisma.JsonValue;
};

function metadataString(meta: Prisma.JsonValue, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function rowMetricKind(row: UsageRow): string {
  return row.metricKind ?? metadataString(row.metadata, "metricKind") ?? "usage";
}

function rowCacheWrite(row: UsageRow): bigint {
  if (row.cacheWriteTokens && row.cacheWriteTokens > BigInt(0)) return row.cacheWriteTokens;
  const meta = row.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return BigInt(0);
  const value = (meta as Record<string, unknown>).cacheWriteTokens;
  return typeof value === "number" ? BigInt(Math.round(value)) : BigInt(0);
}

function rowReasoning(row: UsageRow): bigint {
  if (row.reasoningTokens && row.reasoningTokens > BigInt(0)) return row.reasoningTokens;
  const meta = row.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return BigInt(0);
  const value = (meta as Record<string, unknown>).reasoningTokens;
  return typeof value === "number" ? BigInt(Math.round(value)) : BigInt(0);
}

function hasUsageActivity(row: UsageRow): boolean {
  if (rowMetricKind(row) === "productivity") return false;
  return (
    row.requests > 0 ||
    row.sessions > 0 ||
    row.inputTokens > BigInt(0) ||
    row.outputTokens > BigInt(0) ||
    row.costMicros > BigInt(0)
  );
}

function hasProductivityActivity(row: UsageRow): boolean {
  return (
    row.suggestedLines > BigInt(0) ||
    row.acceptedLines > BigInt(0) ||
    row.addedLines > BigInt(0) ||
    row.deletedLines > BigInt(0) ||
    row.commits > 0
  );
}

function activityKey(row: UsageRow) {
  return [row.date.toISOString().slice(0, 10), row.developerId ?? "", row.toolName, row.model].join("|");
}

function costKey(row: UsageRow) {
  return [row.date.toISOString().slice(0, 10), row.developerId ?? "", row.toolName, row.model].join("|");
}

export type SelectedUsageRow = UsageRow & { selectedActivity: boolean; selectedCost: boolean };

export function selectUsageRows(rows: UsageRow[]): SelectedUsageRow[] {
  const activityPreferred = new Map<string, number>();
  const costPreferred = new Map<string, number>();

  for (const row of rows) {
    const source = normalizeSource(row.source);
    if (hasUsageActivity(row)) {
      activityPreferred.set(activityKey(row), Math.min(activityPreferred.get(activityKey(row)) ?? 99, activityPriority(source)));
    }
    if (row.costMicros > BigInt(0)) {
      costPreferred.set(costKey(row), Math.min(costPreferred.get(costKey(row)) ?? 99, costPriority(source)));
    }
  }

  return rows.map((row) => {
    const source = normalizeSource(row.source);
    const productivity = rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
    return {
      ...row,
      selectedActivity:
        !productivity &&
        hasUsageActivity(row) &&
        activityPriority(source) === activityPreferred.get(activityKey(row)),
      selectedCost: row.costMicros > BigInt(0) && costPriority(source) === costPreferred.get(costKey(row)),
    };
  });
}

export type UsageKpis = {
  modelCalls: number;
  sessions: number;
  verifiedUsageCost: number;
  estimatedApiCost: number;
  actualSpendCost: number;
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

export function aggregateUsageKpis(rows: UsageRow[]): UsageKpis {
  const selected = selectUsageRows(rows);
  const kpis: UsageKpis = {
    modelCalls: 0,
    sessions: 0,
    verifiedUsageCost: 0,
    estimatedApiCost: 0,
    actualSpendCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    suggestedLines: 0,
    acceptedLines: 0,
    addedLines: 0,
    deletedLines: 0,
    commits: 0,
    partialData: false,
  };

  const seenActivity = new Set<string>();
  const seenCost = new Set<string>();

  for (const row of selected) {
    const productivity = rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
    if (productivity || hasProductivityActivity(row)) {
      kpis.suggestedLines += Number(row.suggestedLines);
      kpis.acceptedLines += Number(row.acceptedLines);
      kpis.addedLines += Number(row.addedLines);
      kpis.deletedLines += Number(row.deletedLines);
      kpis.commits += row.commits;
      continue;
    }

    if (row.selectedActivity) {
      const key = activityKey(row);
      if (!seenActivity.has(key)) {
        seenActivity.add(key);
        kpis.modelCalls += row.requests;
        kpis.sessions += row.sessions;
        kpis.inputTokens += Number(row.inputTokens);
        kpis.outputTokens += Number(row.outputTokens);
        kpis.cacheReadTokens += Number(row.cacheReadTokens);
        kpis.cacheWriteTokens += Number(rowCacheWrite(row));
        kpis.reasoningTokens += Number(rowReasoning(row));
      }
    } else if (hasUsageActivity(row)) {
      kpis.partialData = true;
    }

    if (row.selectedCost) {
      const key = costKey(row);
      if (!seenCost.has(key)) {
        seenCost.add(key);
        const cost = Number(row.costMicros) / 1_000_000;
        const kind = row.costKind ?? costKindForRow(row);
        if (kind === "verified_usage") kpis.verifiedUsageCost += cost;
        else if (kind === "actual_spend") kpis.actualSpendCost += cost;
        else kpis.estimatedApiCost += cost;
      }
    } else if (row.costMicros > BigInt(0)) {
      kpis.partialData = true;
    }
  }

  return kpis;
}

export type ModelUsageAggregate = {
  toolName: string;
  model: string;
  provider: string;
  source: string;
  verified: boolean;
  metricKind: "usage" | "productivity";
  costKind: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  cost: number;
  suggestedLines: number;
  acceptedLines: number;
  addedLines: number;
  deletedLines: number;
  commits: number;
};

export function aggregateModelUsage(rows: UsageRow[]): { usage: ModelUsageAggregate[]; productivity: ModelUsageAggregate[] } {
  const selected = selectUsageRows(rows);
  const usageMap = new Map<string, ModelUsageAggregate>();
  const productivityMap = new Map<string, ModelUsageAggregate>();

  for (const row of selected) {
    const productivity = rowMetricKind(row) === "productivity" || isProductivityMetric(rowMetricKind(row), row.source);
    const key = `${row.toolName}|${row.model}|${normalizeSource(row.source)}`;
    const target = productivity ? productivityMap : usageMap;
    const existing = target.get(key) ?? {
      toolName: row.toolName || "unknown",
      model: row.model || "unknown",
      provider: row.provider,
      source: normalizeSource(row.source),
      verified: row.verified,
      metricKind: productivity ? "productivity" as const : "usage" as const,
      costKind: null,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      cost: 0,
      suggestedLines: 0,
      acceptedLines: 0,
      addedLines: 0,
      deletedLines: 0,
      commits: 0,
    };

    if (productivity) {
      existing.suggestedLines += Number(row.suggestedLines);
      existing.acceptedLines += Number(row.acceptedLines);
      existing.addedLines += Number(row.addedLines);
      existing.deletedLines += Number(row.deletedLines);
      existing.commits += row.commits;
    } else if (row.selectedActivity) {
      existing.requests += row.requests;
      existing.inputTokens += Number(row.inputTokens);
      existing.outputTokens += Number(row.outputTokens);
      existing.cacheReadTokens += Number(row.cacheReadTokens);
      existing.cacheWriteTokens += Number(rowCacheWrite(row));
      existing.reasoningTokens += Number(rowReasoning(row));
    }

    if (!productivity && row.selectedCost) {
      existing.cost += Number(row.costMicros) / 1_000_000;
      existing.costKind = row.costKind ?? costKindForRow(row);
      existing.verified = existing.verified || row.verified;
    }

    target.set(key, existing);
  }

  const sortFn = (a: ModelUsageAggregate, b: ModelUsageAggregate) =>
    b.cost - a.cost || b.requests - a.requests || a.model.localeCompare(b.model);

  return {
    usage: Array.from(usageMap.values()).sort(sortFn),
    productivity: Array.from(productivityMap.values()).sort(sortFn),
  };
}

export async function fetchUsageRows(input: {
  orgId: string;
  developerId?: string;
  from: Date;
  to: Date;
}) {
  return prisma.usageDaily.findMany({
    where: {
      orgId: input.orgId,
      ...(input.developerId ? { developerId: input.developerId } : {}),
      date: usageDayFilter(input.from, input.to),
    },
    select: {
      date: true,
      developerId: true,
      toolName: true,
      model: true,
      provider: true,
      source: true,
      verified: true,
      requests: true,
      sessions: true,
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      reasoningTokens: true,
      suggestedLines: true,
      acceptedLines: true,
      addedLines: true,
      deletedLines: true,
      commits: true,
      costMicros: true,
      metricKind: true,
      costKind: true,
      metadata: true,
    },
  });
}

export function groupByDay(rows: UsageRow[]) {
  const selected = selectUsageRows(rows);
  const map = new Map<string, { date: string; modelCalls: number; cost: number }>();
  for (const row of selected) {
    if (rowMetricKind(row) === "productivity") continue;
    const date = row.date.toISOString().slice(0, 10);
    const entry = map.get(date) ?? { date, modelCalls: 0, cost: 0 };
    if (row.selectedActivity) {
      entry.modelCalls += row.requests;
    }
    if (row.selectedCost) {
      entry.cost += Number(row.costMicros) / 1_000_000;
    }
    map.set(date, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function groupByTool(rows: UsageRow[]) {
  const selected = selectUsageRows(rows);
  const map = new Map<string, { toolName: string; modelCalls: number; cost: number; tokens: number; developers: Set<string> }>();
  for (const row of selected) {
    if (rowMetricKind(row) === "productivity") continue;
    const toolName = row.toolName || "unknown";
    const entry = map.get(toolName) ?? { toolName, modelCalls: 0, cost: 0, tokens: 0, developers: new Set<string>() };
    if (row.selectedActivity) {
      entry.modelCalls += row.requests;
      entry.tokens += Number(row.inputTokens) + Number(row.outputTokens);
    }
    if (row.selectedCost) entry.cost += Number(row.costMicros) / 1_000_000;
    if (row.developerId) entry.developers.add(row.developerId);
    map.set(toolName, entry);
  }
  return Array.from(map.values())
    .map((row) => ({
      toolName: row.toolName,
      modelCalls: row.modelCalls,
      cost: row.cost,
      tokens: row.tokens,
      activeDevelopers: row.developers.size,
    }))
    .sort((a, b) => b.modelCalls - a.modelCalls);
}

export function groupByModel(rows: UsageRow[]) {
  const { usage } = aggregateModelUsage(rows);
  return usage.map((row) => ({
    model: row.model,
    toolName: row.toolName,
    requests: row.requests,
    tokens: row.inputTokens + row.outputTokens,
    cost: row.cost,
    source: row.source,
    verified: row.verified,
    costKind: row.costKind,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    reasoningTokens: row.reasoningTokens,
  }));
}
