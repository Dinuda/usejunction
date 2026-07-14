import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUsageKpis, selectUsageRows } from "../lib/metrics/model-usage";
import { estimateCost } from "../lib/metrics/estimate-cost";

const baseRow = {
  date: new Date("2026-07-01"),
  developerId: "dev-1",
  toolName: "cursor",
  model: "composer-2.5",
  provider: "cursor",
  source: "vendor_verified",
  verified: true,
  requests: 10,
  sessions: 0,
  inputTokens: BigInt(1000),
  outputTokens: BigInt(500),
  cacheReadTokens: BigInt(200),
  cacheWriteTokens: BigInt(0),
  reasoningTokens: BigInt(0),
  suggestedLines: BigInt(0),
  acceptedLines: BigInt(0),
  addedLines: BigInt(0),
  deletedLines: BigInt(0),
  commits: 0,
  costMicros: BigInt(1_000_000),
  metricKind: "usage",
  costKind: "verified_usage",
  metadata: null,
};

test("estimateCost subtracts cache read from OpenAI/Codex input", () => {
  const withCache = estimateCost("gpt-5", 1_000_000, 0, 400_000, 0, "codex");
  const doubleCharged = (1_000_000 / 1_000_000) * 1.25 + (400_000 / 1_000_000) * 0.125;
  assert.ok(withCache < doubleCharged);
});

test("estimateCost bills Claude cache buckets additively", () => {
  const claude = estimateCost("claude-sonnet-4", 1_000_000, 0, 400_000, 100_000, "claude");
  const openai = estimateCost("gpt-5", 1_000_000, 0, 400_000, 100_000, "codex");
  assert.ok(claude > openai);
});

test("selectUsageRows prefers verified vendor cost over device estimate", () => {
  const rows = [
    baseRow,
    {
      ...baseRow,
      source: "device_observed",
      verified: false,
      requests: 999,
      costMicros: BigInt(9_000_000),
      costKind: "estimated_api",
    },
  ];
  const selected = selectUsageRows(rows);
  const verified = selected.find((r) => r.source === "vendor_verified");
  const device = selected.find((r) => r.source === "device_observed");
  assert.equal(verified?.selectedActivity, true);
  assert.equal(verified?.selectedCost, true);
  assert.equal(device?.selectedActivity, false);
  assert.equal(device?.selectedCost, false);
});

test("aggregateUsageKpis excludes productivity rows from model calls", () => {
  const rows = [
    baseRow,
    {
      ...baseRow,
      model: "ai-lines",
      metricKind: "productivity",
      source: "cursor_local",
      requests: 500,
      inputTokens: BigInt(0),
      outputTokens: BigInt(0),
      costMicros: BigInt(0),
      suggestedLines: BigInt(100),
      acceptedLines: BigInt(50),
    },
  ];
  const kpis = aggregateUsageKpis(rows);
  assert.equal(kpis.modelCalls, 10);
  assert.equal(kpis.suggestedLines, 100);
  assert.equal(kpis.acceptedLines, 50);
});

test("aggregateUsageKpis counts more than 40 models without truncation", () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    ...baseRow,
    model: `model-variant-${index}`,
    requests: 1,
    costMicros: BigInt(1000 * (index + 1)),
  }));
  const kpis = aggregateUsageKpis(rows);
  assert.equal(kpis.modelCalls, 55);
});
