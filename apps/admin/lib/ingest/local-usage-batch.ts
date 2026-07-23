import { randomBytes } from "crypto";
import { Prisma, prisma } from "@usejunction/db";
import { CALCULATION_VERSION } from "@/lib/metrics/source-priority";
import { shouldPreserveProductivityRequests } from "@/lib/metrics/local-usage-inventory";

export type LocalUsageInputRow = {
  date: string;
  toolName: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  estimatedCost?: number;
  suggestedLines?: number;
  acceptedLines?: number;
  addedLines?: number;
  deletedLines?: number;
  commits?: number;
  aiPercent?: number | null;
  requests?: number;
  source?: string;
  verified?: boolean;
  metricKind?: string;
  costKind?: string;
  calculationVersion?: string;
  repository?: { host?: string; owner?: string; name?: string };
  metadata?: Record<string, unknown>;
};

export type RepositoryRef = { host: string; owner: string; name: string };

export type NormalizedLocalUsageRow = {
  date: Date;
  dateKey: string;
  toolName: string;
  model: string;
  source: string;
  canonicalSource: string;
  provider: string;
  metricKind: string;
  costKind: string | null;
  calculationVersion: string;
  verified: boolean;
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
  requests: number;
  estimatedCost: number;
  costMicros: bigint;
  aiPercent: number | null;
  metadata: Prisma.InputJsonValue;
  repository: RepositoryRef | null;
  repositoryId: string | null;
  dedupeKey: string;
};

const BULK_CHUNK = 100;

function newRowId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export function providerForTool(toolName: string): string {
  if (toolName === "claude") return "anthropic";
  if (toolName === "codex" || toolName === "codex-work") return "openai";
  if (toolName === "copilot") return "github";
  if (toolName === "antigravity") return "google";
  return toolName;
}

export function normalizeCanonicalSource(source: string): string {
  if (source === "local_scan" || source === "cursor_local" || source === "antigravity_local" || source === "antigravity_usage") {
    return "device_observed";
  }
  if (source === "cursor_usage_events") return "vendor_verified";
  return source;
}

export function inferMetricKind(row: LocalUsageInputRow, source: string): string {
  if (row.metricKind) return row.metricKind;
  if (source === "cursor_local") return "productivity";
  if (
    (row.suggestedLines ?? 0) + (row.acceptedLines ?? 0) + (row.addedLines ?? 0) + (row.commits ?? 0) > 0 &&
    (row.inputTokens ?? 0) + (row.outputTokens ?? 0) === 0
  ) {
    return "productivity";
  }
  return "usage";
}

export function inferCostKind(row: LocalUsageInputRow, source: string, estimatedCost: number): string | null {
  if (row.costKind) return row.costKind;
  if (estimatedCost <= 0) return null;
  if (row.verified || source === "cursor_usage_events" || normalizeCanonicalSource(source) === "vendor_verified") {
    return "verified_usage";
  }
  return "estimated_api";
}

export function buildUsageDedupeKey(params: {
  deviceId: string;
  dateKey: string;
  toolName: string;
  model: string;
  source: string;
  repositoryId: string | null;
}): string {
  return `device:${params.deviceId}:${params.dateKey}:${params.toolName}:${params.model}:${params.source}:${params.repositoryId ?? ""}`;
}

function normalizeRepository(input: LocalUsageInputRow["repository"]): RepositoryRef | null {
  if (!input?.host || !input.owner || !input.name) return null;
  return {
    host: input.host.toLowerCase().slice(0, 255),
    owner: input.owner.slice(0, 255),
    name: input.name.slice(0, 255),
  };
}

export function repositoryKey(repo: RepositoryRef): string {
  return `${repo.host}\0${repo.owner}\0${repo.name}`;
}

/** Normalize inbound aggregates; drops invalid rows the same way as the legacy loop. */
export function normalizeLocalUsageRows(
  rows: LocalUsageInputRow[],
  ctx: { deviceId: string },
): NormalizedLocalUsageRow[] {
  const out: NormalizedLocalUsageRow[] = [];
  for (const row of rows) {
    if (!row.date || !row.toolName) continue;
    const date = new Date(row.date);
    if (Number.isNaN(date.getTime())) continue;
    const estimatedCost = row.estimatedCost ?? 0;
    if (estimatedCost < 0) continue;

    const model = row.model ?? "";
    const source = row.source ?? "local_scan";
    const metricKind = inferMetricKind(row, source);
    const canonicalSource = normalizeCanonicalSource(source);
    const verified = Boolean(row.verified) || canonicalSource === "vendor_verified";
    const costKind = inferCostKind(row, source, estimatedCost);
    const calculationVersion = row.calculationVersion ?? CALCULATION_VERSION;
    const inputTokens = Math.max(0, Math.round(row.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.round(row.outputTokens ?? 0));
    const cacheReadTokens = Math.max(0, Math.round(row.cacheReadTokens ?? 0));
    const cacheWriteTokens = Math.max(0, Math.round(row.cacheWriteTokens ?? 0));
    const reasoningTokens = Math.max(0, Math.round(row.reasoningTokens ?? 0));
    const suggestedLines = Math.max(0, Math.round(row.suggestedLines ?? 0));
    const acceptedLines = Math.max(0, Math.round(row.acceptedLines ?? 0));
    const addedLines = Math.max(0, Math.round(row.addedLines ?? 0));
    const deletedLines = Math.max(0, Math.round(row.deletedLines ?? 0));
    const commits = Math.max(0, Math.round(row.commits ?? 0));
    const aiPercent = typeof row.aiPercent === "number" ? row.aiPercent : null;
    const requests =
      metricKind === "productivity" && !shouldPreserveProductivityRequests(metricKind, model)
        ? 0
        : Math.max(0, Number(row.requests ?? 0));
    const dateKey = date.toISOString().slice(0, 10);
    const repository = normalizeRepository(row.repository);
    const metadata: Prisma.InputJsonValue = {
      cacheWriteTokens,
      reasoningTokens,
      aiPercent,
      originalSource: source,
      ...(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}),
    };

    out.push({
      date,
      dateKey,
      toolName: row.toolName,
      model,
      source,
      canonicalSource,
      provider: providerForTool(row.toolName),
      metricKind,
      costKind,
      calculationVersion,
      verified,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens,
      suggestedLines,
      acceptedLines,
      addedLines,
      deletedLines,
      commits,
      requests,
      estimatedCost,
      costMicros: BigInt(Math.max(0, Math.round(estimatedCost * 1_000_000))),
      aiPercent,
      metadata,
      repository,
      repositoryId: null,
      dedupeKey: buildUsageDedupeKey({
        deviceId: ctx.deviceId,
        dateKey,
        toolName: row.toolName,
        model,
        source,
        repositoryId: null,
      }),
    });
  }
  return out;
}

export function attachRepositoryIds(
  rows: NormalizedLocalUsageRow[],
  deviceId: string,
  repoIds: Map<string, string>,
): NormalizedLocalUsageRow[] {
  return rows.map((row) => {
    const repositoryId = row.repository ? repoIds.get(repositoryKey(row.repository)) ?? null : null;
    return {
      ...row,
      repositoryId,
      dedupeKey: buildUsageDedupeKey({
        deviceId,
        dateKey: row.dateKey,
        toolName: row.toolName,
        model: row.model,
        source: row.source,
        repositoryId,
      }),
    };
  });
}

function localAggregateKey(row: NormalizedLocalUsageRow): string {
  const repoKey = row.repository
    ? `${row.repository.host}/${row.repository.owner}/${row.repository.name}`
    : row.repositoryId ?? "";
  return `${row.dateKey}|${row.toolName}|${row.model}|${row.source}|${repoKey}`;
}

function repositoryKeyForAggregate(row: NormalizedLocalUsageRow): string {
  if (row.repository) {
    return `${row.repository.host}/${row.repository.owner}/${row.repository.name}`;
  }
  return "";
}

/**
 * Collapse duplicates that would violate bulk INSERT ON CONFLICT targets.
 * Last-write-wins matches the old per-row Prisma upsert loop.
 */
export function collapseLocalUsageRows(rows: NormalizedLocalUsageRow[]): NormalizedLocalUsageRow[] {
  if (rows.length <= 1) return rows;

  const byLocalKey = new Map<string, NormalizedLocalUsageRow>();
  for (const row of rows) {
    byLocalKey.set(localAggregateKey(row), row);
  }

  const byDedupeKey = new Map<string, NormalizedLocalUsageRow>();
  for (const row of byLocalKey.values()) {
    byDedupeKey.set(row.dedupeKey, row);
  }
  return [...byDedupeKey.values()];
}

export async function resolveRepositoryIdMap(
  orgId: string,
  rows: NormalizedLocalUsageRow[],
): Promise<Map<string, string>> {
  const unique = new Map<string, RepositoryRef>();
  for (const row of rows) {
    if (!row.repository) continue;
    unique.set(repositoryKey(row.repository), row.repository);
  }
  const map = new Map<string, string>();
  if (unique.size === 0) return map;

  const repos = [...unique.values()];
  await prisma.repository.createMany({
    data: repos.map((repo) => ({ orgId, ...repo })),
    skipDuplicates: true,
  });
  const found = await prisma.repository.findMany({
    where: {
      orgId,
      OR: repos.map((repo) => ({ host: repo.host, owner: repo.owner, name: repo.name })),
    },
    select: { id: true, host: true, owner: true, name: true },
  });
  for (const repo of found) {
    map.set(repositoryKey(repo), repo.id);
  }
  return map;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function metadataJson(value: Prisma.InputJsonValue): string {
  return JSON.stringify(value);
}

async function bulkUpsertLocalUsageAggregates(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  deviceId: string,
  rows: NormalizedLocalUsageRow[],
) {
  for (const batch of chunkRows(rows, BULK_CHUNK)) {
    const values = batch.map(
      (row) => Prisma.sql`(
        ${newRowId()},
        ${orgId},
        ${userId},
        ${deviceId},
        ${row.dateKey}::date,
        ${row.toolName},
        ${row.model},
        ${repositoryKeyForAggregate(row)},
        ${row.inputTokens},
        ${row.outputTokens},
        ${BigInt(row.cacheReadTokens)},
        ${BigInt(row.cacheWriteTokens)},
        ${BigInt(row.reasoningTokens)},
        ${row.suggestedLines},
        ${row.acceptedLines},
        ${row.addedLines},
        ${row.deletedLines},
        ${row.commits},
        ${row.aiPercent},
        ${row.requests},
        ${row.estimatedCost},
        ${row.source},
        ${row.verified},
        ${row.metricKind},
        ${row.costKind},
        ${row.calculationVersion},
        ${metadataJson(row.metadata)}::jsonb
      )`,
    );

    await tx.$executeRaw`
      INSERT INTO local_usage_aggregates (
        id, org_id, user_id, device_id, date, tool_name, model, repository_key,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
        suggested_lines, accepted_lines, added_lines, deleted_lines, commits,
        ai_percent, requests, estimated_cost, source, verified, metric_kind, cost_kind,
        calculation_version, metadata
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (device_id, date, tool_name, model, source, repository_key) DO UPDATE SET
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        cache_read_tokens = EXCLUDED.cache_read_tokens,
        cache_write_tokens = EXCLUDED.cache_write_tokens,
        reasoning_tokens = EXCLUDED.reasoning_tokens,
        suggested_lines = EXCLUDED.suggested_lines,
        accepted_lines = EXCLUDED.accepted_lines,
        added_lines = EXCLUDED.added_lines,
        deleted_lines = EXCLUDED.deleted_lines,
        commits = EXCLUDED.commits,
        ai_percent = EXCLUDED.ai_percent,
        requests = EXCLUDED.requests,
        estimated_cost = EXCLUDED.estimated_cost,
        source = EXCLUDED.source,
        verified = EXCLUDED.verified,
        metric_kind = EXCLUDED.metric_kind,
        cost_kind = EXCLUDED.cost_kind,
        calculation_version = EXCLUDED.calculation_version,
        metadata = EXCLUDED.metadata
    `;
  }
}

async function bulkUpsertUsageDaily(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  deviceId: string,
  rows: NormalizedLocalUsageRow[],
  observedAt: Date,
) {
  for (const batch of chunkRows(rows, BULK_CHUNK)) {
    const values = batch.map(
      (row) => Prisma.sql`(
        ${newRowId()},
        ${orgId},
        ${userId},
        ${deviceId},
        ${row.repositoryId},
        ${row.dateKey}::date,
        ${row.provider},
        ${row.toolName},
        ${row.toolName},
        ${row.model},
        ${row.canonicalSource},
        ${row.dedupeKey},
        ${row.verified},
        ${row.requests},
        ${BigInt(row.inputTokens)},
        ${BigInt(row.outputTokens)},
        ${BigInt(row.cacheReadTokens)},
        ${BigInt(row.cacheWriteTokens)},
        ${BigInt(row.reasoningTokens)},
        ${BigInt(row.suggestedLines)},
        ${BigInt(row.acceptedLines)},
        ${BigInt(row.addedLines)},
        ${BigInt(row.deletedLines)},
        ${row.commits},
        ${row.costMicros},
        ${row.metricKind},
        ${row.costKind},
        ${row.calculationVersion},
        ${row.dedupeKey},
        ${observedAt},
        ${metadataJson(row.metadata)}::jsonb
      )`,
    );

    await tx.$executeRaw`
      INSERT INTO usage_daily (
        id, org_id, developer_id, device_id, repository_id, date,
        provider, product, tool_name, model, source, source_ref, verified,
        requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
        suggested_lines, accepted_lines, added_lines, deleted_lines, commits, cost_micros,
        metric_kind, cost_kind, calculation_version, dedupe_key, observed_at, metadata
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (org_id, dedupe_key) DO UPDATE SET
        repository_id = EXCLUDED.repository_id,
        requests = EXCLUDED.requests,
        input_tokens = EXCLUDED.input_tokens,
        output_tokens = EXCLUDED.output_tokens,
        cache_read_tokens = EXCLUDED.cache_read_tokens,
        cache_write_tokens = EXCLUDED.cache_write_tokens,
        reasoning_tokens = EXCLUDED.reasoning_tokens,
        suggested_lines = EXCLUDED.suggested_lines,
        accepted_lines = EXCLUDED.accepted_lines,
        added_lines = EXCLUDED.added_lines,
        deleted_lines = EXCLUDED.deleted_lines,
        commits = EXCLUDED.commits,
        cost_micros = EXCLUDED.cost_micros,
        verified = EXCLUDED.verified,
        source = EXCLUDED.source,
        metric_kind = EXCLUDED.metric_kind,
        cost_kind = EXCLUDED.cost_kind,
        calculation_version = EXCLUDED.calculation_version,
        metadata = EXCLUDED.metadata,
        observed_at = EXCLUDED.observed_at
    `;
  }
}

export type LocalUsageBatchResult = {
  upserted: number;
  totalTokens: number;
  totalRequests: number;
  sample: Array<{ date: string; toolName: string; model: string; requests: number; tokens: number }>;
};

/** Normalize, resolve repos, and bulk-upsert both local + daily tables. */
export async function ingestLocalUsageBatch(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  rows: LocalUsageInputRow[];
}): Promise<LocalUsageBatchResult> {
  const normalized = normalizeLocalUsageRows(params.rows, { deviceId: params.deviceId });
  if (normalized.length === 0) {
    return { upserted: 0, totalTokens: 0, totalRequests: 0, sample: [] };
  }

  const repoIds = await resolveRepositoryIdMap(params.orgId, normalized);
  const rows = collapseLocalUsageRows(attachRepositoryIds(normalized, params.deviceId, repoIds));
  const observedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await bulkUpsertLocalUsageAggregates(tx, params.orgId, params.userId, params.deviceId, rows);
    await bulkUpsertUsageDaily(tx, params.orgId, params.userId, params.deviceId, rows, observedAt);
  });

  const sample: LocalUsageBatchResult["sample"] = [];
  let totalTokens = 0;
  let totalRequests = 0;
  for (const row of rows) {
    totalTokens += row.inputTokens + row.outputTokens;
    totalRequests += row.requests;
    if (sample.length < 8) {
      sample.push({
        date: row.dateKey,
        toolName: row.toolName,
        model: row.model || "unknown",
        requests: row.requests,
        tokens: row.inputTokens + row.outputTokens,
      });
    }
  }

  return { upserted: rows.length, totalTokens, totalRequests, sample };
}
