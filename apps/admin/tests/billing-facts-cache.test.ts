import assert from "node:assert/strict";
import { test } from "vitest";
import {
  BILLING_FACTS_CONTRACT_VERSION,
  billingFactsCacheKey,
  reviveBillingFacts,
  serializeBillingFacts,
} from "../lib/analytics/query/billing-facts";
import type { CanonicalBillingFact } from "../lib/analytics/query/sql";
import { UTC_TIMEZONE } from "../lib/analytics/contracts/time-window";

const now = new Date("2026-07-15T18:00:00.000Z");
const window = {
  from: new Date("2026-06-16T00:00:00.000Z"),
  to: new Date("2026-07-15T00:00:00.000Z"),
  timezone: UTC_TIMEZONE,
  grain: "day" as const,
};

test("billing facts cache keys isolate organization and developer scopes", () => {
  const org = billingFactsCacheKey({ orgId: "org-a", actorId: "owner-a", role: "owner" }, window);
  const sameOrg = billingFactsCacheKey({ orgId: "org-a", actorId: "owner-b", role: "owner" }, window);
  const developer = billingFactsCacheKey({
    orgId: "org-a",
    actorId: "developer-a",
    role: "user",
    developerId: "developer-a",
  }, window);
  const otherOrg = billingFactsCacheKey({ orgId: "org-b", actorId: "owner-a", role: "owner" }, window);
  const otherWindow = billingFactsCacheKey(
    { orgId: "org-a", actorId: "owner-a", role: "owner" },
    { ...window, from: new Date("2026-01-01T00:00:00.000Z") },
  );

  assert.equal(org, sameOrg);
  assert.notEqual(org, developer);
  assert.notEqual(org, otherOrg);
  assert.notEqual(org, otherWindow);
  assert.equal(BILLING_FACTS_CONTRACT_VERSION, "billing-facts-v1");
});

test("billing facts serialize and revive bigint fields", () => {
  const facts: CanonicalBillingFact[] = [
    {
      date: new Date("2026-07-12T00:00:00.000Z"),
      developerId: "dev-1",
      provider: "openai",
      product: "api_platform",
      toolName: "openai-api",
      source: "canonical",
      costMicros: BigInt(12_500_000),
      inputTokens: BigInt(2_000_000),
      outputTokens: BigInt(500_000),
      cacheReadTokens: BigInt(100_000),
      observedAt: new Date("2026-07-12T18:30:00.000Z"),
    },
  ];

  const serialized = serializeBillingFacts(facts);
  assert.equal(serialized[0]?.costMicros, "12500000");
  assert.equal(typeof serialized[0]?.inputTokens, "string");

  const revived = reviveBillingFacts(serialized);
  assert.equal(revived[0]?.costMicros, BigInt(12_500_000));
  assert.equal(revived[0]?.inputTokens, BigInt(2_000_000));
  assert.equal(revived[0]?.outputTokens, BigInt(500_000));
  assert.equal(revived[0]?.cacheReadTokens, BigInt(100_000));
  assert.equal(revived[0]?.date.toISOString(), facts[0]!.date.toISOString());
  assert.equal(revived[0]?.observedAt.toISOString(), facts[0]!.observedAt.toISOString());
  assert.equal(revived[0]?.developerId, "dev-1");
});

test("cached billing facts hit on second read", { skip: !process.env.DATABASE_URL }, async () => {
  const [{ prisma }, { readCachedCanonicalBillingFacts }] = await Promise.all([
    import("@usejunction/db"),
    import("../lib/analytics/query/billing-facts"),
  ]);
  const orgId = `test_org_billing_cache_${Date.now()}`;
  await prisma.organization.create({
    data: { id: orgId, name: "Billing Cache Test", slug: orgId },
  });
  try {
    await prisma.usageDaily.create({
      data: {
        id: `${orgId}_usage`,
        orgId,
        date: new Date("2026-07-12T00:00:00.000Z"),
        provider: "openai",
        product: "api_platform",
        toolName: "openai-api",
        model: "gpt-5",
        source: "device_observed",
        requests: 3,
        inputTokens: BigInt(1_000_000),
        outputTokens: BigInt(200_000),
        costMicros: BigInt(4_500_000),
        metricKind: "usage",
        costKind: "estimated_api",
        dedupeKey: `${orgId}:openai:2026-07-12`,
        observedAt: now,
      },
    });

    const scope = { orgId, actorId: "owner-a", role: "owner" as const };
    const reportWindow = {
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-15T00:00:00.000Z"),
      timezone: UTC_TIMEZONE,
      grain: "day" as const,
    };

    const first = await readCachedCanonicalBillingFacts(scope, reportWindow, { now });
    assert.equal(first.meta.cache.status, "miss");
    assert.ok(first.facts.length >= 1);
    assert.equal(typeof first.facts[0]?.costMicros, "bigint");

    const second = await readCachedCanonicalBillingFacts(scope, reportWindow, { now });
    assert.equal(second.meta.cache.status, "hit");
    assert.equal(second.facts.length, first.facts.length);
    assert.equal(second.facts[0]?.costMicros, first.facts[0]?.costMicros);
  } finally {
    await prisma.analyticsQueryCache.deleteMany({ where: { orgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
});
