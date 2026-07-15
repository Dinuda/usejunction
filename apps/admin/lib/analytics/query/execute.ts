import { createHash } from "node:crypto";
import { Prisma, prisma } from "@usejunction/db";
import { CALCULATION_VERSION, PRICING_VERSION } from "@/lib/metrics/source-priority";
import {
  type AnalyticsCacheStatus,
  type AnalyticsQueryRow,
  type AnalyticsScope,
  type NormalizedUsageQueryV1,
  USAGE_ACCOUNTING_POLICY_VERSION,
  USAGE_QUERY_CONTRACT_VERSION,
  type UsageQueryEnvelopeV1,
} from "./contracts";
import { normalizeUsageQuery, stableQueryJson } from "./normalize";
import { readDataThrough, runUsageQuerySql } from "./sql";

const ACTIVE_TTL_MS = 5 * 60_000;
const HISTORICAL_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_BYTES = 1024 * 1024;

type CachedPayload = {
  generatedAt: string;
  dataThrough: string | null;
  rows: AnalyticsQueryRow[];
};

function scopeKey(scope: AnalyticsScope) {
  return scope.developerId ? `developer:${scope.developerId}` : "organization";
}

export function analyticsCacheKey(scope: AnalyticsScope, query: NormalizedUsageQueryV1) {
  return createHash("sha256")
    .update([
      USAGE_QUERY_CONTRACT_VERSION,
      USAGE_ACCOUNTING_POLICY_VERSION,
      CALCULATION_VERSION,
      PRICING_VERSION,
      scope.orgId,
      scopeKey(scope),
      stableQueryJson(query),
    ].join("\n"))
    .digest("hex");
}

function signedAdvisoryKey(cacheKey: string) {
  const unsigned = BigInt(`0x${cacheKey.slice(0, 16)}`);
  return unsigned > BigInt("0x7fffffffffffffff") ? unsigned - (BigInt(1) << BigInt(64)) : unsigned;
}

function cacheTtl(query: NormalizedUsageQueryV1, now: Date) {
  const today = now.toISOString().slice(0, 10);
  return query.window.to >= today ? ACTIVE_TTL_MS : HISTORICAL_TTL_MS;
}

function payloadFromJson(value: Prisma.JsonValue): CachedPayload {
  return value as unknown as CachedPayload;
}

function envelope(
  query: NormalizedUsageQueryV1,
  payload: CachedPayload,
  status: AnalyticsCacheStatus,
  expiresAt: Date | null,
): UsageQueryEnvelopeV1 {
  return {
    schemaVersion: "1",
    kind: "usage-query",
    generatedAt: payload.generatedAt,
    dataThrough: payload.dataThrough,
    timezone: "UTC",
    window: query.window,
    data: { rows: payload.rows },
    meta: { cache: { status, expiresAt: expiresAt?.toISOString() ?? null } },
  };
}

export async function executeUsageQuery(
  scope: AnalyticsScope,
  input: unknown,
  options: { now?: Date; bypassCache?: boolean } = {},
): Promise<UsageQueryEnvelopeV1> {
  const now = options.now ?? new Date();
  const query = normalizeUsageQuery(input, now);
  const key = analyticsCacheKey(scope, query);

  if (!options.bypassCache) {
    const cached = await prisma.analyticsQueryCache.findUnique({ where: { key } });
    if (cached && cached.expiresAt > now) {
      return envelope(query, payloadFromJson(cached.result), "hit", cached.expiresAt);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (!options.bypassCache) {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${signedAdvisoryKey(key)})`);
      const rechecked = await tx.analyticsQueryCache.findUnique({ where: { key } });
      if (rechecked && rechecked.expiresAt > now) {
        return envelope(query, payloadFromJson(rechecked.result), "hit", rechecked.expiresAt);
      }
    }

    const startedAt = Date.now();
    const [rows, dataThrough] = await Promise.all([
      runUsageQuerySql(tx, scope, query),
      readDataThrough(tx, scope),
    ]);
    const payload: CachedPayload = {
      generatedAt: now.toISOString(),
      dataThrough: dataThrough?.toISOString() ?? null,
      rows,
    };
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    const expiresAt = new Date(now.getTime() + cacheTtl(query, now));
    const previous = await tx.analyticsQueryCache.findUnique({ where: { key }, select: { expiresAt: true } });

    if (!options.bypassCache && bytes <= MAX_CACHE_BYTES) {
      await tx.analyticsQueryCache.deleteMany({ where: { expiresAt: { lte: now } } });
      await tx.analyticsQueryCache.upsert({
        where: { key },
        create: {
          key,
          orgId: scope.orgId,
          scopeHash: createHash("sha256").update(scopeKey(scope)).digest("hex"),
          contractVersion: USAGE_QUERY_CONTRACT_VERSION,
          calculationVersion: `${CALCULATION_VERSION}:${PRICING_VERSION}:${USAGE_ACCOUNTING_POLICY_VERSION}`,
          normalizedQuery: query as unknown as Prisma.InputJsonValue,
          result: payload as unknown as Prisma.InputJsonValue,
          generatedAt: now,
          dataThrough,
          expiresAt,
        },
        update: {
          normalizedQuery: query as unknown as Prisma.InputJsonValue,
          result: payload as unknown as Prisma.InputJsonValue,
          generatedAt: now,
          dataThrough,
          expiresAt,
        },
      });
    }

    const status: AnalyticsCacheStatus = options.bypassCache || bytes > MAX_CACHE_BYTES
      ? "bypass"
      : previous
        ? "refresh"
        : "miss";
    console.info(JSON.stringify({
      event: "analytics.query",
      key: key.slice(0, 12),
      orgId: scope.orgId,
      status,
      durationMs: Date.now() - startedAt,
      resultRows: rows.length,
      resultBytes: bytes,
    }));
    return envelope(query, payload, status, status === "bypass" ? null : expiresAt);
  });

  return result;
}
