import { createHash } from "node:crypto";
import { Prisma, prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { CALCULATION_VERSION, PRICING_VERSION } from "@/lib/metrics/source-priority";
import {
  type AnalyticsCacheStatus,
  type AnalyticsScope,
  USAGE_ACCOUNTING_POLICY_VERSION,
} from "./contracts";
import { readCanonicalBillingFacts, type CanonicalBillingFact } from "./sql";

export const BILLING_FACTS_CONTRACT_VERSION = "billing-facts-v1";

const ACTIVE_TTL_MS = 5 * 60_000;
const HISTORICAL_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_BYTES = 1024 * 1024;

type BillingFactsWindowKey = { from: string; to: string };

type SerializedBillingFact = {
  date: string;
  developerId: string | null;
  provider: string;
  product: string;
  toolName: string;
  source: string;
  costMicros: string;
  inputTokens: string;
  outputTokens: string;
  cacheReadTokens: string;
  observedAt: string;
};

type CachedBillingPayload = {
  generatedAt: string;
  facts: SerializedBillingFact[];
};

function scopeKey(scope: AnalyticsScope) {
  return scope.developerId ? `developer:${scope.developerId}` : "organization";
}

function windowKey(window: MetricWindow): BillingFactsWindowKey {
  return {
    from: window.from.toISOString().slice(0, 10),
    to: window.to.toISOString().slice(0, 10),
  };
}

export function billingFactsCacheKey(scope: AnalyticsScope, window: MetricWindow) {
  const key = windowKey(window);
  return createHash("sha256")
    .update([
      BILLING_FACTS_CONTRACT_VERSION,
      USAGE_ACCOUNTING_POLICY_VERSION,
      CALCULATION_VERSION,
      PRICING_VERSION,
      scope.orgId,
      scopeKey(scope),
      key.from,
      key.to,
    ].join("\n"))
    .digest("hex");
}

function signedAdvisoryKey(cacheKey: string) {
  const unsigned = BigInt(`0x${cacheKey.slice(0, 16)}`);
  return unsigned > BigInt("0x7fffffffffffffff") ? unsigned - (BigInt(1) << BigInt(64)) : unsigned;
}

function cacheTtlMs(window: MetricWindow, now: Date) {
  const today = now.toISOString().slice(0, 10);
  return windowKey(window).to >= today ? ACTIVE_TTL_MS : HISTORICAL_TTL_MS;
}

/** Exported for unit tests — JSON-safe bigint/date encoding. */
export function serializeBillingFacts(facts: CanonicalBillingFact[]): SerializedBillingFact[] {
  return facts.map((fact) => ({
    date: fact.date.toISOString(),
    developerId: fact.developerId,
    provider: fact.provider,
    product: fact.product,
    toolName: fact.toolName,
    source: fact.source,
    costMicros: fact.costMicros.toString(),
    inputTokens: fact.inputTokens.toString(),
    outputTokens: fact.outputTokens.toString(),
    cacheReadTokens: fact.cacheReadTokens.toString(),
    observedAt: fact.observedAt.toISOString(),
  }));
}

/** Exported for unit tests — revive cached billing facts. */
export function reviveBillingFacts(facts: SerializedBillingFact[]): CanonicalBillingFact[] {
  return facts.map((fact) => ({
    date: new Date(fact.date),
    developerId: fact.developerId,
    provider: fact.provider,
    product: fact.product,
    toolName: fact.toolName,
    source: fact.source,
    costMicros: BigInt(fact.costMicros),
    inputTokens: BigInt(fact.inputTokens),
    outputTokens: BigInt(fact.outputTokens),
    cacheReadTokens: BigInt(fact.cacheReadTokens),
    observedAt: new Date(fact.observedAt),
  }));
}

function payloadFromJson(value: Prisma.JsonValue): CachedBillingPayload {
  return value as unknown as CachedBillingPayload;
}

export type CachedCanonicalBillingFacts = {
  facts: CanonicalBillingFact[];
  meta: { cache: { status: AnalyticsCacheStatus; expiresAt: string | null } };
};

/**
 * Cached wrapper around `readCanonicalBillingFacts` using the same
 * AnalyticsQueryCache table / TTL rules as usage queries.
 */
export async function readCachedCanonicalBillingFacts(
  scope: AnalyticsScope,
  window: MetricWindow,
  options: { now?: Date; bypassCache?: boolean } = {},
): Promise<CachedCanonicalBillingFacts> {
  const now = options.now ?? new Date();
  const key = billingFactsCacheKey(scope, window);
  const normalizedQuery = {
    kind: BILLING_FACTS_CONTRACT_VERSION,
    window: windowKey(window),
    scope: scopeKey(scope),
  };

  if (!options.bypassCache) {
    const cached = await prisma.analyticsQueryCache.findUnique({ where: { key } });
    if (cached && cached.expiresAt > now) {
      const payload = payloadFromJson(cached.result);
      return {
        facts: reviveBillingFacts(payload.facts),
        meta: { cache: { status: "hit", expiresAt: cached.expiresAt.toISOString() } },
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    if (!options.bypassCache) {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${signedAdvisoryKey(key)})`);
      const rechecked = await tx.analyticsQueryCache.findUnique({ where: { key } });
      if (rechecked && rechecked.expiresAt > now) {
        const payload = payloadFromJson(rechecked.result);
        return {
          facts: reviveBillingFacts(payload.facts),
          meta: { cache: { status: "hit" as const, expiresAt: rechecked.expiresAt.toISOString() } },
        };
      }
    }

    const startedAt = Date.now();
    const facts = await readCanonicalBillingFacts(tx, scope, window);
    const payload: CachedBillingPayload = {
      generatedAt: now.toISOString(),
      facts: serializeBillingFacts(facts),
    };
    const bytes = Buffer.byteLength(JSON.stringify(payload));
    const expiresAt = new Date(now.getTime() + cacheTtlMs(window, now));
    const previous = await tx.analyticsQueryCache.findUnique({ where: { key }, select: { expiresAt: true } });

    if (!options.bypassCache && bytes <= MAX_CACHE_BYTES) {
      await tx.analyticsQueryCache.deleteMany({ where: { orgId: scope.orgId, expiresAt: { lte: now } } });
      await tx.analyticsQueryCache.upsert({
        where: { key },
        create: {
          key,
          orgId: scope.orgId,
          scopeHash: createHash("sha256").update(scopeKey(scope)).digest("hex"),
          contractVersion: BILLING_FACTS_CONTRACT_VERSION,
          calculationVersion: `${CALCULATION_VERSION}:${PRICING_VERSION}:${USAGE_ACCOUNTING_POLICY_VERSION}`,
          normalizedQuery: normalizedQuery as unknown as Prisma.InputJsonValue,
          result: payload as unknown as Prisma.InputJsonValue,
          generatedAt: now,
          dataThrough: null,
          expiresAt,
        },
        update: {
          normalizedQuery: normalizedQuery as unknown as Prisma.InputJsonValue,
          result: payload as unknown as Prisma.InputJsonValue,
          generatedAt: now,
          dataThrough: null,
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
      event: "analytics.billing_facts",
      key: key.slice(0, 12),
      orgId: scope.orgId,
      status,
      durationMs: Date.now() - startedAt,
      resultRows: facts.length,
      resultBytes: bytes,
    }));

    return {
      facts,
      meta: { cache: { status, expiresAt: status === "bypass" ? null : expiresAt.toISOString() } },
    };
  });
}
