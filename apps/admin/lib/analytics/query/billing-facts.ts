import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  type AnalyticsCacheStatus,
  type AnalyticsScope,
} from "./contracts";
import { readCanonicalBillingFacts, type CanonicalBillingFact } from "./sql";

export const BILLING_FACTS_CONTRACT_VERSION = "billing-facts-v1";

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

/** Exported for unit tests — revive serialized billing facts. */
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

export type CachedCanonicalBillingFacts = {
  facts: CanonicalBillingFact[];
  meta: { cache: { status: AnalyticsCacheStatus; expiresAt: string | null } };
};

/**
 * Live wrapper around `readCanonicalBillingFacts` (no query-result cache).
 * Name retained for call-site stability.
 */
export async function readCachedCanonicalBillingFacts(
  scope: AnalyticsScope,
  window: MetricWindow,
  _options: { now?: Date } = {},
): Promise<CachedCanonicalBillingFacts> {
  const startedAt = Date.now();
  const facts = await readCanonicalBillingFacts(prisma, scope, window);
  const bytes = Buffer.byteLength(JSON.stringify(serializeBillingFacts(facts)));
  console.info(JSON.stringify({
    event: "analytics.billing_facts",
    orgId: scope.orgId,
    status: "bypass",
    durationMs: Date.now() - startedAt,
    resultRows: facts.length,
    resultBytes: bytes,
  }));

  return {
    facts,
    meta: { cache: { status: "bypass", expiresAt: null } },
  };
}
