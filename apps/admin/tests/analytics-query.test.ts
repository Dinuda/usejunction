import assert from "node:assert/strict";
import { test } from "vitest";
import { analyticsCacheKey } from "../lib/analytics/query/execute";
import { normalizeUsageQuery, stableQueryJson } from "../lib/analytics/query/normalize";

const now = new Date("2026-07-15T18:00:00.000Z");

test("usage query normalization makes unordered selections and filters cache-stable", () => {
  const first = normalizeUsageQuery({
    window: { preset: 30 },
    measures: ["costMicros", "requests"],
    dimensions: ["tool", "day"],
    filters: { providers: ["openai", "anthropic", "openai"] },
  }, now);
  const second = normalizeUsageQuery({
    window: { preset: 30 },
    measures: ["requests", "costMicros"],
    dimensions: ["day", "tool"],
    filters: { providers: ["anthropic", "openai"] },
  }, now);

  assert.equal(stableQueryJson(first), stableQueryJson(second));
  assert.deepEqual(first.window, { from: "2026-06-16", to: "2026-07-15", grain: "day" });
});

test("usage query rejects windows longer than 366 inclusive days", () => {
  assert.throws(() => normalizeUsageQuery({
    window: { from: "2025-01-01", to: "2026-01-02" },
    measures: ["requests"],
  }, now), /cannot exceed 366 days/);
});

test("usage query requires order fields to be selected", () => {
  assert.throws(() => normalizeUsageQuery({
    window: { preset: 7 },
    measures: ["requests"],
    orderBy: [{ field: "costMicros", direction: "desc" }],
  }, now), /orderBy field must be selected/);
});

test("analytics cache keys isolate organization and developer scopes", () => {
  const query = normalizeUsageQuery({ window: { preset: 7 }, measures: ["requests"] }, now);
  const org = analyticsCacheKey({ orgId: "org-a", actorId: "owner-a", role: "owner" }, query);
  const sameOrgOtherOwner = analyticsCacheKey({ orgId: "org-a", actorId: "owner-b", role: "owner" }, query);
  const developer = analyticsCacheKey({
    orgId: "org-a",
    actorId: "developer-a",
    role: "user",
    developerId: "developer-a",
  }, query);
  const otherOrg = analyticsCacheKey({ orgId: "org-b", actorId: "owner-a", role: "owner" }, query);

  assert.equal(org, sameOrgOtherOwner);
  assert.notEqual(org, developer);
  assert.notEqual(org, otherOrg);
});

test("usage query includes DATE rows on the inclusive cycle start day", { skip: !process.env.DATABASE_URL }, async () => {
  const [{ prisma }, { UTC_TIMEZONE }, { metricNumber, readUsageMetrics }] = await Promise.all([
    import("@usejunction/db"),
    import("../lib/analytics/contracts/time-window"),
    import("../lib/analytics/query"),
  ]);
  const orgId = `test_org_date_${Date.now()}`;
  await prisma.organization.create({
    data: {
      id: orgId,
      name: "Date Query Test",
      slug: orgId,
    },
  });
  try {
    await prisma.usageDaily.create({
      data: {
        id: `${orgId}_usage`,
        orgId,
        date: new Date("2026-07-16T00:00:00.000Z"),
        provider: "openai",
        product: "codex",
        toolName: "codex",
        model: "gpt-5",
        source: "device_observed",
        requests: 7,
        costMicros: BigInt(1_230_000),
        metricKind: "usage",
        costKind: "estimated_api",
        dedupeKey: `${orgId}:codex:2026-07-16`,
      },
    });

    const result = await readUsageMetrics({
      orgId,
      window: {
        from: new Date("2026-07-16T00:00:00.000Z"),
        to: new Date("2026-08-15T00:00:00.000Z"),
        timezone: UTC_TIMEZONE,
        grain: "day",
      },
      measures: ["requests", "costMicros"],
      filters: { toolNames: ["codex"] },
    });

    assert.equal(metricNumber(result.data.rows[0], "requests"), 7);
    assert.equal(metricNumber(result.data.rows[0], "costMicros"), 1_230_000);
  } finally {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
});

test("canonical usage keeps estimated cost while preserving observed activity precedence", { skip: !process.env.DATABASE_URL }, async () => {
  const [{ prisma }, { UTC_TIMEZONE }, { metricNumber, dimension, readUsageMetrics }] = await Promise.all([
    import("@usejunction/db"),
    import("../lib/analytics/contracts/time-window"),
    import("../lib/analytics/query"),
  ]);
  const orgId = `test_org_cost_${Date.now()}`;
  await prisma.organization.create({ data: { id: orgId, name: "Cost Query Test", slug: orgId } });
  try {
    await prisma.usageDaily.createMany({
      data: [
        {
          id: `${orgId}_verified`,
          orgId,
          date: new Date("2026-07-10T00:00:00.000Z"),
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          model: "gpt-4.1",
          source: "vendor_verified",
          verified: true,
          requests: 10,
          inputTokens: BigInt(1_000_000),
          outputTokens: BigInt(500_000),
          costMicros: BigInt(5_000_000),
          costKind: "verified_usage",
          dedupeKey: `${orgId}:verified`,
        },
        {
          id: `${orgId}_estimated`,
          orgId,
          date: new Date("2026-07-11T00:00:00.000Z"),
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          model: "gpt-4.1",
          source: "estimated",
          requests: 5,
          inputTokens: BigInt(100),
          outputTokens: BigInt(50),
          costMicros: BigInt(1_000_000),
          costKind: "estimated_api",
          dedupeKey: `${orgId}:estimated`,
        },
      ],
    });

    const result = await readUsageMetrics({
      orgId,
      window: {
        from: new Date("2026-07-10T00:00:00.000Z"),
        to: new Date("2026-07-11T00:00:00.000Z"),
        timezone: UTC_TIMEZONE,
        grain: "day",
      },
      measures: ["requests", "costMicros"],
      dimensions: ["costKind"],
    });

    const verified = result.data.rows.find((row) => dimension(row, "costKind") === "verified_usage");
    const estimated = result.data.rows.find((row) => dimension(row, "costKind") === "estimated_api");
    assert.equal(metricNumber(verified, "requests"), 10);
    assert.equal(metricNumber(verified, "costMicros"), 5_000_000);
    assert.equal(metricNumber(estimated, "requests"), 0);
    assert.equal(metricNumber(estimated, "costMicros"), 1_000_000);
  } finally {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
});

test("verified cost suppresses lower-priority cost only within same provider/tool/model", { skip: !process.env.DATABASE_URL }, async () => {
  const [{ prisma }, { UTC_TIMEZONE }, { metricNumber, readUsageMetrics }] = await Promise.all([
    import("@usejunction/db"),
    import("../lib/analytics/contracts/time-window"),
    import("../lib/analytics/query"),
  ]);
  const orgId = `test_org_verified_precedence_${Date.now()}`;
  await prisma.organization.create({ data: { id: orgId, name: "Verified Cost Precedence", slug: orgId } });
  try {
    await prisma.usageDaily.createMany({
      data: [
        {
          id: `${orgId}_provider`, orgId, date: new Date("2026-07-19T00:00:00.000Z"),
          provider: "openai", product: "api_platform", toolName: "openai-api", model: "gpt-5",
          source: "vendor_verified", verified: true, costMicros: BigInt(8_000_000),
          costKind: "verified_usage", dedupeKey: `${orgId}:provider`,
        },
        {
          id: `${orgId}_gateway_same`, orgId, date: new Date("2026-07-19T00:00:00.000Z"),
          provider: "openai", product: "gateway", toolName: "openai-api", model: "gpt-5",
          source: "gateway_observed", requests: 10, costMicros: BigInt(3_000_000),
          costKind: "estimated_api", dedupeKey: `${orgId}:gateway-same`,
        },
        {
          id: `${orgId}_gateway_other`, orgId, date: new Date("2026-07-19T00:00:00.000Z"),
          provider: "openai", product: "gateway", toolName: "junction-gateway", model: "gpt-5",
          source: "gateway_observed", requests: 4, costMicros: BigInt(2_000_000),
          costKind: "estimated_api", dedupeKey: `${orgId}:gateway-other`,
        },
      ],
    });

    const result = await readUsageMetrics({
      orgId,
      window: { from: new Date("2026-07-19T00:00:00.000Z"), to: new Date("2026-07-19T00:00:00.000Z"), timezone: UTC_TIMEZONE, grain: "day" },
      measures: ["costMicros"],
    });
    // Same tool+model: verified (8M) wins over gateway (3M).
    // Different tool: gateway other (2M) still counts — fine-grained cost partition.
    assert.equal(metricNumber(result.data.rows[0], "costMicros"), 10_000_000);
  } finally {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
});
