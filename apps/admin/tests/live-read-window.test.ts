import assert from "node:assert/strict";
import { test } from "vitest";
import {
  LIVE_READ_HORIZON_DAYS,
  eachIsoDayInclusive,
  orgLiveRowsForRead,
  splitLiveReadWindow,
  windowUsesLiveReads,
} from "@/lib/analytics/snapshots/overlay";

test("windowUsesLiveReads is true for recent short windows", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-06-24T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  assert.equal(windowUsesLiveReads(from, to, now), true);
  assert.equal(LIVE_READ_HORIZON_DAYS, 35);
});

test("splitLiveReadWindow isolates history older than the live horizon", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-04-01T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  const split = splitLiveReadWindow(from, to, now);
  assert.ok(split.historyFrom);
  assert.ok(split.historyTo);
  assert.ok(split.liveFrom);
  assert.ok(split.liveTo);
  assert.equal(split.liveFrom!.toISOString().slice(0, 10), "2026-06-18");
  assert.equal(split.historyTo!.toISOString().slice(0, 10), "2026-06-17");
  assert.equal(eachIsoDayInclusive(split.liveFrom!, split.liveTo!).length, LIVE_READ_HORIZON_DAYS + 1);
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

test("splitLiveReadWindow is live-only when fully inside horizon", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-07-01T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  const split = splitLiveReadWindow(from, to, now);
  assert.equal(split.historyFrom, null);
  assert.equal(split.historyTo, null);
  assert.ok(split.liveFrom);
  assert.ok(split.liveTo);
});
