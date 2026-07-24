import assert from "node:assert/strict";
import { test } from "vitest";
import {
  filterActiveSubscriptionCycles,
  rollupSubscriptionCyclesByTool,
} from "../lib/insights/queries/rollup-subscription-cycles";
import { mergeUsageBackedCycleSources } from "../lib/insights/queries/usage-backed-cycle-sources";
import { canonicalToolKey } from "../lib/tools/catalog";

const cycle = (nextRenewalDate: string) => ({
  cycleStart: "2026-07-01",
  cycleEnd: nextRenewalDate,
  nextRenewalDate,
  elapsedPercent: 0.5,
  remainingDays: 15,
  totalDays: 30,
});

test("mergeUsageBackedCycleSources adds coding tools with requests and no subscription", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const merged = mergeUsageBackedCycleSources(
    [
      {
        id: "cursor-sub",
        name: "Pro+",
        toolName: "cursor",
        toolKey: "cursor",
        usageToolNames: ["cursor"],
        billingCadence: "monthly",
        billingCycleAnchorDate: new Date("2026-07-15T00:00:00.000Z"),
        billingCycleDays: null,
        cycleSeatMicros: BigInt(60_000_000),
        seatCount: 1,
        startDate: new Date("2026-07-15T00:00:00.000Z"),
        endDate: null,
      },
    ],
    [
      { toolName: "cursor", requests: 100 },
      { toolName: "antigravity", requests: 39 },
      { toolName: "antigravity", requests: 1 },
    ],
    now,
  );

  assert.equal(merged.length, 2);
  const usageRow = merged.find((row) => row.id === "usage:antigravity");
  assert.ok(usageRow);
  assert.equal(usageRow.toolKey, "antigravity");
  assert.equal(usageRow.name, "Individual");
  assert.equal(usageRow.cycleSeatMicros, BigInt(0));
  assert.ok(usageRow.usageToolNames.includes("antigravity"));
});

test("mergeUsageBackedCycleSources skips tools already covered by a subscription", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const merged = mergeUsageBackedCycleSources(
    [
      {
        id: "agy-sub",
        name: "Google AI Pro",
        toolName: "antigravity",
        toolKey: "antigravity",
        usageToolNames: ["antigravity", "agy"],
        billingCadence: "monthly",
        billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
        billingCycleDays: null,
        cycleSeatMicros: BigInt(19_990_000),
        seatCount: 1,
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: null,
      },
    ],
    [{ toolName: "antigravity", requests: 39 }],
    now,
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, "agy-sub");
});

test("active cycle filter keeps free $0 seats with model calls", () => {
  const filtered = filterActiveSubscriptionCycles([
    {
      id: "antigravity",
      toolName: "antigravity",
      toolKey: "antigravity",
      planNames: ["Individual"],
      planCount: 1,
      cycleSpend: 0,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 39,
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      spendSharePercent: 0,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      expectedEndAt: null,
      billingCycle: cycle("2026-08-01"),
    },
    {
      id: "claude",
      toolName: "claude",
      toolKey: "claude",
      planNames: ["Pro"],
      planCount: 1,
      cycleSpend: 20,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 0,
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      spendSharePercent: 100,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      expectedEndAt: null,
      billingCycle: cycle("2026-08-01"),
    },
  ]);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.toolKey, "antigravity");
  assert.equal(filtered[0]?.cycleSpend, 0);
  assert.equal(filtered[0]?.modelCalls, 39);
});

test("existing Ultra seat with report-window traffic stays visible after floor", () => {
  // Ultra seat anchored at detection day so cycle allocation is 0, while the
  // Tools/report window still has earlier antigravity requests.
  const rolled = rollupSubscriptionCyclesByTool([
    {
      id: "agy-ultra:2026-07-24",
      subscriptionId: "agy-ultra",
      name: "Google AI Ultra",
      toolName: "antigravity",
      toolKey: "antigravity",
      cycleSpend: 99.99,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 0,
      windowFrom: "2026-07-24",
      windowTo: "2026-08-23",
      billingCycle: {
        cycleStart: "2026-07-24",
        cycleEnd: "2026-08-24",
        nextRenewalDate: "2026-08-24",
        elapsedPercent: 0.1,
        remainingDays: 27,
        totalDays: 30,
      },
    },
  ]);

  const reportWindowRequests = new Map<string, number>([["antigravity", 39]]);
  const floored = rolled.map((row) => {
    const key = canonicalToolKey(row.toolKey ?? row.toolName);
    const reportCalls = reportWindowRequests.get(key) ?? 0;
    return reportCalls > row.modelCalls ? { ...row, modelCalls: reportCalls } : row;
  });

  const filtered = filterActiveSubscriptionCycles(floored);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.toolKey, "antigravity");
  assert.equal(filtered[0]?.modelCalls, 39);
  assert.equal(filtered[0]?.cycleSpend, 99.99);
});
