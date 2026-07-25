import assert from "node:assert/strict";
import { test } from "vitest";
import {
  eachIsoDayInclusive,
  orgLiveRowsForRead,
} from "@/lib/analytics/snapshots/overlay";

test("eachIsoDayInclusive covers inclusive UTC day range", () => {
  const from = new Date("2026-07-01T00:00:00.000Z");
  const to = new Date("2026-07-03T00:00:00.000Z");
  assert.deepEqual(eachIsoDayInclusive(from, to), ["2026-07-01", "2026-07-02", "2026-07-03"]);
});

test("orgLiveRowsForRead keeps org day totals without null-developer bucket duplicates", () => {
  const rows = [
    {
      date: new Date("2026-07-13T00:00:00.000Z"),
      toolName: "",
      developerId: "",
      isDayTotal: true,
      isDeveloperGrain: false,
      requests: 12,
      inputTokens: BigInt(1_000_000),
      outputTokens: BigInt(200_000),
      verifiedUsageCostMicros: BigInt(8_000_000),
      estimatedApiCostMicros: BigInt(0),
      actualSpendCostMicros: BigInt(0),
      activeDevelopers: 0,
      activeDeveloperIds: [],
      sourceObservedThrough: null,
    },
    {
      date: new Date("2026-07-13T00:00:00.000Z"),
      toolName: "",
      developerId: "",
      isDayTotal: true,
      isDeveloperGrain: true,
      requests: 12,
      inputTokens: BigInt(1_000_000),
      outputTokens: BigInt(200_000),
      verifiedUsageCostMicros: BigInt(8_000_000),
      estimatedApiCostMicros: BigInt(0),
      actualSpendCostMicros: BigInt(0),
      activeDevelopers: 0,
      activeDeveloperIds: [],
      sourceObservedThrough: null,
    },
    {
      date: new Date("2026-07-12T00:00:00.000Z"),
      toolName: "openai-api",
      developerId: "",
      isDayTotal: false,
      isDeveloperGrain: false,
      requests: 25,
      inputTokens: BigInt(2_000_000),
      outputTokens: BigInt(500_000),
      verifiedUsageCostMicros: BigInt(12_000_000),
      estimatedApiCostMicros: BigInt(0),
      actualSpendCostMicros: BigInt(0),
      activeDevelopers: 1,
      activeDeveloperIds: ["e2e-developer"],
      sourceObservedThrough: null,
    },
  ];

  const selected = orgLiveRowsForRead(rows);
  assert.equal(selected.length, 2);
  assert.equal(selected[0]?.verifiedUsageCostMicros, BigInt(8_000_000));
  assert.equal(selected[1]?.toolName, "openai-api");
});
