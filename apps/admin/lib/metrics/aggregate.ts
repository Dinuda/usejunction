import { prisma } from "@usejunction/db";
import { usageDayFilter } from "@/lib/metrics/date-range";
import { activityPriority, costPriority, normalizeSource } from "@/lib/metrics/source-priority";

export type MetricGroup = "day" | "developer" | "tool" | "provider" | "repository";

function rowMetricKind(row: { metricKind?: string | null; metadata?: unknown }): string {
  if (row.metricKind) return row.metricKind;
  if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
    const value = (row.metadata as Record<string, unknown>).metricKind;
    if (typeof value === "string") return value;
  }
  return "usage";
}

export async function aggregateMetrics(input: { orgId: string; developerId?: string; from: Date; to: Date; groupBy: MetricGroup; includeAllSources: boolean }) {
  const rows = await prisma.usageDaily.findMany({
    where: { orgId: input.orgId, ...(input.developerId ? { developerId: input.developerId } : {}), date: usageDayFilter(input.from, input.to) },
    include: {
      developer: { select: { id: true, name: true, email: true } },
      repository: { select: { id: true, host: true, owner: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

  const activityKey = (row: (typeof rows)[number]) => [row.date.toISOString().slice(0, 10), row.developerId ?? "", row.provider, row.model, input.groupBy === "repository" ? row.repositoryId ?? "" : ""].join("|");
  const costKey = (row: (typeof rows)[number]) => [row.date.toISOString().slice(0, 10), row.developerId ?? "", row.provider, input.groupBy === "repository" ? row.repositoryId ?? "" : ""].join("|");
  const hasActivity = (row: (typeof rows)[number]) =>
    rowMetricKind(row) !== "productivity" &&
    (row.requests > 0 || row.sessions > 0 || row.inputTokens > BigInt(0) || row.outputTokens > BigInt(0) || row.activeSeconds > BigInt(0));
  const hasProductivity = (row: (typeof rows)[number]) =>
    row.suggestedLines > BigInt(0) || row.acceptedLines > BigInt(0) || row.addedLines > BigInt(0) || row.deletedLines > BigInt(0) || row.commits > 0;
  const activityPreferred = new Map<string, number>();
  const costPreferred = new Map<string, number>();
  for (const row of rows) {
    const source = normalizeSource(row.source);
    if (hasActivity(row)) activityPreferred.set(activityKey(row), Math.min(activityPreferred.get(activityKey(row)) ?? 99, activityPriority(source)));
    if (row.costMicros > BigInt(0)) costPreferred.set(costKey(row), Math.min(costPreferred.get(costKey(row)) ?? 99, costPriority(source)));
  }
  const selected = rows.map((row) => ({
    row,
    activity: hasActivity(row) && (input.includeAllSources || activityPriority(normalizeSource(row.source)) === activityPreferred.get(activityKey(row))),
    cost: row.costMicros > BigInt(0) && (input.includeAllSources || costPriority(normalizeSource(row.source)) === costPreferred.get(costKey(row))),
    productivity: hasProductivity(row) && rowMetricKind(row) === "productivity",
  })).filter((selection) => selection.activity || selection.cost || selection.productivity);

  type Aggregate = {
    key: string;
    label: string;
    requests: number;
    sessions: number;
    inputTokens: bigint;
    outputTokens: bigint;
    cacheReadTokens: bigint;
    activeSeconds: bigint;
    suggestedLines: bigint;
    acceptedLines: bigint;
    addedLines: bigint;
    deletedLines: bigint;
    commits: number;
    pullRequests: number;
    costMicros: bigint;
    sources: Set<string>;
    freshestAt: Date;
    verified: boolean;
  };
  const aggregates = new Map<string, Aggregate>();
  for (const selection of selected) {
    const { row } = selection;
    const day = row.date.toISOString().slice(0, 10);
    const grouping = input.groupBy === "day"
      ? { key: day, label: day }
      : input.groupBy === "developer"
        ? { key: row.developerId ?? "unattributed", label: row.developer ? `${row.developer.name} <${row.developer.email}>` : "Unattributed" }
        : input.groupBy === "tool"
          ? { key: row.toolName || "unknown", label: row.toolName || "Unknown" }
          : input.groupBy === "provider"
            ? { key: `${row.provider}:${row.product}`, label: row.product ? `${row.provider} / ${row.product}` : row.provider }
            : { key: row.repositoryId ?? "unattributed", label: row.repository ? `${row.repository.host}/${row.repository.owner}/${row.repository.name}` : "Unattributed" };
    const aggregate = aggregates.get(grouping.key) ?? {
      ...grouping, requests: 0, sessions: 0, inputTokens: BigInt(0), outputTokens: BigInt(0), cacheReadTokens: BigInt(0), activeSeconds: BigInt(0),
      suggestedLines: BigInt(0), acceptedLines: BigInt(0), addedLines: BigInt(0), deletedLines: BigInt(0), commits: 0, pullRequests: 0,
      costMicros: BigInt(0), sources: new Set<string>(), freshestAt: row.observedAt, verified: true,
    };
    if (selection.activity) {
      aggregate.requests += row.requests;
      aggregate.sessions += row.sessions;
      aggregate.inputTokens += row.inputTokens;
      aggregate.outputTokens += row.outputTokens;
      aggregate.cacheReadTokens += row.cacheReadTokens;
      aggregate.activeSeconds += row.activeSeconds;
    }
    if (selection.productivity) {
      aggregate.suggestedLines += row.suggestedLines;
      aggregate.acceptedLines += row.acceptedLines;
      aggregate.addedLines += row.addedLines;
      aggregate.deletedLines += row.deletedLines;
      aggregate.commits += row.commits;
      aggregate.pullRequests += row.pullRequests;
    }
    if (selection.cost) aggregate.costMicros += row.costMicros;
    aggregate.sources.add(row.source);
    if (row.observedAt > aggregate.freshestAt) aggregate.freshestAt = row.observedAt;
    aggregate.verified &&= row.verified;
    aggregates.set(grouping.key, aggregate);
  }
  return Array.from(aggregates.values()).map((row) => ({
    key: row.key,
    label: row.label,
    requests: row.requests,
    sessions: row.sessions,
    inputTokens: row.inputTokens.toString(),
    outputTokens: row.outputTokens.toString(),
    cacheReadTokens: row.cacheReadTokens.toString(),
    activeSeconds: row.activeSeconds.toString(),
    suggestedLines: row.suggestedLines.toString(),
    acceptedLines: row.acceptedLines.toString(),
    addedLines: row.addedLines.toString(),
    deletedLines: row.deletedLines.toString(),
    commits: row.commits,
    pullRequests: row.pullRequests,
    costMicros: row.costMicros.toString(),
    costUsd: (Number(row.costMicros) / 1_000_000).toFixed(6),
    sources: Array.from(row.sources).sort(),
    verified: row.verified,
    freshestAt: row.freshestAt.toISOString(),
  }));
}
