import assert from "node:assert/strict";
import test from "node:test";
import { accumulateBuckets } from "../lib/analytics/materialize-metric-buckets";
import { METRIC_VERSION } from "../lib/analytics/metric-version";
import { selectUsageRows } from "../lib/metrics/model-usage";

test("METRIC_VERSION is metrics-v1", () => {
  assert.equal(METRIC_VERSION, "metrics-v1");
});

test("accumulateBuckets collapses selected activity and cost into dimension keys", () => {
  const day = new Date("2026-07-10T00:00:00.000Z");
  const rows = selectUsageRows([
    {
      date: day,
      developerId: "dev-1",
      toolName: "cursor",
      model: "composer",
      provider: "cursor",
      source: "vendor_verified",
      verified: true,
      requests: 10,
      sessions: 1,
      inputTokens: BigInt(100),
      outputTokens: BigInt(50),
      cacheReadTokens: BigInt(0),
      cacheWriteTokens: BigInt(0),
      reasoningTokens: BigInt(0),
      suggestedLines: BigInt(0),
      acceptedLines: BigInt(0),
      addedLines: BigInt(0),
      deletedLines: BigInt(0),
      commits: 0,
      costMicros: BigInt(2_000_000),
      metricKind: "usage",
      costKind: "verified_usage",
      metadata: null,
    },
    {
      date: day,
      developerId: "dev-1",
      toolName: "cursor",
      model: "composer",
      provider: "cursor",
      source: "device_observed",
      verified: false,
      requests: 99,
      sessions: 0,
      inputTokens: BigInt(999),
      outputTokens: BigInt(999),
      cacheReadTokens: BigInt(0),
      suggestedLines: BigInt(0),
      acceptedLines: BigInt(0),
      addedLines: BigInt(0),
      deletedLines: BigInt(0),
      commits: 0,
      costMicros: BigInt(9_000_000),
      metricKind: "usage",
      costKind: "estimated_api",
      metadata: null,
    },
  ]);

  const buckets = accumulateBuckets(rows);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0]!.requests, 10);
  assert.equal(buckets[0]!.inputTokens, BigInt(100));
  assert.equal(buckets[0]!.verifiedCostMicros, BigInt(2_000_000));
  assert.equal(buckets[0]!.developerId, "dev-1");
  assert.equal(buckets[0]!.metricKind, "usage");
});

test("accumulateBuckets keeps productivity separate", () => {
  const day = new Date("2026-07-10T00:00:00.000Z");
  const rows = selectUsageRows([
    {
      date: day,
      developerId: "dev-1",
      toolName: "cursor",
      model: "ai-lines",
      provider: "cursor",
      source: "device_observed",
      verified: false,
      requests: 0,
      sessions: 0,
      inputTokens: BigInt(0),
      outputTokens: BigInt(0),
      cacheReadTokens: BigInt(0),
      suggestedLines: BigInt(40),
      acceptedLines: BigInt(20),
      addedLines: BigInt(10),
      deletedLines: BigInt(2),
      commits: 3,
      costMicros: BigInt(0),
      metricKind: "productivity",
      costKind: null,
      metadata: null,
    },
  ]);

  const buckets = accumulateBuckets(rows);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0]!.metricKind, "productivity");
  assert.equal(buckets[0]!.suggestedLines, BigInt(40));
  assert.equal(buckets[0]!.requests, 0);
});
