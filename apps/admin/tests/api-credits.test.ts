import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { calculateCreditBalance, readApiCreditPool, resolveCreditPeriod } from "../lib/api-credits";
import { apiCreditPoolInputSchema } from "../lib/api-credits/validation";
import { resolveProviderApiKeyMapping } from "../lib/integrations/api-key-mapping";

const createdAt = new Date("2026-01-15T11:30:00.000Z");

describe("API credit periods", () => {
  test("resolves recurring monthly and custom UTC periods", () => {
    const monthly = resolveCreditPeriod({
      mode: "recurring",
      billingCadence: "monthly",
      billingCycleAnchorDate: new Date("2026-01-15T00:00:00.000Z"),
      billingCycleDays: null,
      grantStartDate: null,
      expiresAt: null,
      createdAt,
    } as never, new Date("2026-07-19T22:00:00.000Z"));
    assert.equal(monthly.start.toISOString(), "2026-07-15T00:00:00.000Z");
    assert.equal(monthly.end.toISOString(), "2026-08-15T00:00:00.000Z");

    const custom = resolveCreditPeriod({
      mode: "recurring",
      billingCadence: "custom",
      billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
      billingCycleDays: 10,
      grantStartDate: null,
      expiresAt: null,
      createdAt,
    } as never, new Date("2026-07-25T23:59:00.000Z"));
    assert.equal(custom.start.toISOString(), "2026-07-21T00:00:00.000Z");
    assert.equal(custom.end.toISOString(), "2026-07-31T00:00:00.000Z");
  });

  test("resolves fixed grants through expiry or the current UTC day", () => {
    const expiring = resolveCreditPeriod({
      mode: "fixed",
      billingCadence: null,
      billingCycleAnchorDate: null,
      billingCycleDays: null,
      grantStartDate: new Date("2026-07-01T12:00:00.000Z"),
      expiresAt: new Date("2026-08-01T18:00:00.000Z"),
      createdAt,
    } as never, new Date("2026-07-19T12:00:00.000Z"));
    assert.equal(expiring.start.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(expiring.end.toISOString(), "2026-08-01T00:00:00.000Z");

    const openEnded = resolveCreditPeriod({ ...{
      mode: "fixed",
      billingCadence: null,
      billingCycleAnchorDate: null,
      billingCycleDays: null,
      grantStartDate: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: null,
      createdAt,
    } } as never, new Date("2026-07-19T12:00:00.000Z"));
    assert.equal(openEnded.end.toISOString(), "2026-07-20T00:00:00.000Z");
  });
});

describe("API credit balances", () => {
  test("keeps overages negative while clamping display utilization", () => {
    const balance = calculateCreditBalance({
      budgetMicros: BigInt(100_000_000),
      verifiedSpentMicros: BigInt(120_000_000),
      pendingEstimatedMicros: BigInt(5_000_000),
      fallbackEstimatedMicros: BigInt(0),
      hasVerified: true,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      now: new Date("2026-07-05T12:00:00.000Z"),
      spendDays: 5,
    });
    assert.equal(balance.verifiedRemainingMicros, BigInt(-20_000_000));
    assert.equal(balance.projectedRemainingMicros, BigInt(-25_000_000));
    assert.equal(balance.rawRatio, 1.25);
    assert.equal(balance.displayRatio, 1);
  });

  test("returns no verified balance when cost permission is unavailable", () => {
    const balance = calculateCreditBalance({
      budgetMicros: BigInt(100_000_000),
      verifiedSpentMicros: BigInt(0),
      fallbackEstimatedMicros: BigInt(25_000_000),
      pendingEstimatedMicros: BigInt(5_000_000),
      hasVerified: false,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      now: new Date("2026-07-02T00:00:00.000Z"),
      spendDays: 2,
    });
    assert.equal(balance.verifiedRemainingMicros, null);
    assert.equal(balance.projectedSpentMicros, BigInt(30_000_000));
    assert.equal(balance.projectedRemainingMicros, BigInt(70_000_000));
    assert.equal(balance.projectedExhaustionAt, null);
  });

  test("forecasts only after three calendar days of spend", () => {
    const base = {
      budgetMicros: BigInt(90_000_000),
      verifiedSpentMicros: BigInt(30_000_000),
      pendingEstimatedMicros: BigInt(0),
      fallbackEstimatedMicros: BigInt(0),
      hasVerified: true,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      now: new Date("2026-07-03T12:00:00.000Z"),
    };
    assert.equal(calculateCreditBalance({ ...base, spendDays: 2 }).projectedExhaustionAt, null);
    assert.equal(calculateCreditBalance({ ...base, spendDays: 3 }).projectedExhaustionAt?.toISOString(), "2026-07-10T00:00:00.000Z");
  });
});

test("API credit pool validation enforces mode-specific fields", () => {
  assert.equal(apiCreditPoolInputSchema.safeParse({
    connectionId: "connection",
    mode: "recurring",
    budgetMicros: "1000000",
    billingCadence: "custom",
  }).success, false);
  assert.equal(apiCreditPoolInputSchema.safeParse({
    connectionId: "connection",
    mode: "fixed",
    budgetMicros: "1000000",
    grantStartDate: "2026-07-20",
    expiresAt: "2026-07-19",
  }).success, false);
});

test("provider key owner matching never overwrites a manual mapping or manual clear", () => {
  assert.deepEqual(resolveProviderApiKeyMapping(null, "developer-owner"), {
    developerId: "developer-owner",
    mappingSource: "provider_owner",
  });
  assert.deepEqual(resolveProviderApiKeyMapping({ developerId: "developer-manual", mappingSource: "manual" }, "developer-owner"), {
    developerId: "developer-manual",
    mappingSource: "manual",
  });
  assert.deepEqual(resolveProviderApiKeyMapping({ developerId: null, mappingSource: "manual" }, "developer-owner"), {
    developerId: null,
    mappingSource: "manual",
  });
});

test("pending gateway estimates disappear after a successful cost sync watermark", { skip: !process.env.DATABASE_URL }, async () => {
  const { prisma } = await import("@usejunction/db");
  const orgId = `test_api_credit_pending_${Date.now()}`;
  await prisma.organization.create({ data: { id: orgId, name: "API Credit Pending", slug: orgId } });
  try {
    const connection = await prisma.providerConnection.create({ data: {
      orgId, provider: "openai", product: "api_platform", method: "admin_api_key", status: "active",
      createdByUserId: "test-user", permissions: ["organization_costs:read"], lastCostSyncedAt: new Date("2026-07-18T00:00:00.000Z"),
    } });
    const pool = await prisma.apiCreditPool.create({ data: {
      orgId, connectionId: connection.id, provider: "openai", product: "api_platform", name: "OpenAI API credits",
      mode: "recurring", budgetMicros: BigInt(100_000_000), billingCadence: "monthly",
      billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"), createdByUserId: "test-user",
    } });
    await prisma.usageDaily.create({ data: {
      orgId, date: new Date("2026-07-19T00:00:00.000Z"), observedAt: new Date("2026-07-19T12:00:00.000Z"),
      provider: "openai", product: "gateway", toolName: "junction-gateway", model: "gpt-5",
      source: "gateway_observed", requests: 1, costMicros: BigInt(2_000_000), costKind: "estimated_api",
      dedupeKey: `${orgId}:pending`,
    } });

    const before = await readApiCreditPool({ ...pool, connection: { ...connection, lastCostSyncedAt: new Date("2026-07-18T00:00:00.000Z") } }, new Date("2026-07-19T15:00:00.000Z"));
    assert.equal(before.pendingEstimatedMicros, "2000000");

    const synced = await prisma.providerConnection.update({ where: { id: connection.id }, data: {
      lastCostSyncedAt: new Date("2026-07-20T00:00:00.000Z"), costDataThrough: new Date("2026-07-19T23:59:59.000Z"),
    } });
    const after = await readApiCreditPool({ ...pool, connection: synced }, new Date("2026-07-20T01:00:00.000Z"));
    assert.equal(after.pendingEstimatedMicros, "0");
  } finally {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
});
