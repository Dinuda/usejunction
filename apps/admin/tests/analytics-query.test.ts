import assert from "node:assert/strict";
import test from "node:test";
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
    role: "developer",
    developerId: "developer-a",
  }, query);
  const otherOrg = analyticsCacheKey({ orgId: "org-b", actorId: "owner-a", role: "owner" }, query);

  assert.equal(org, sameOrgOtherOwner);
  assert.notEqual(org, developer);
  assert.notEqual(org, otherOrg);
});
