import assert from "node:assert/strict";
import { test } from "vitest";
import {
  enrichSubscriptionCyclesWithUtilization,
  filterActiveSubscriptionCycles,
  rollupSubscriptionCyclesByTool,
} from "../lib/insights/queries/rollup-subscription-cycles";
import type { PlanUsageSubscriptionRow } from "../lib/insights/contracts/plan-usage.v1";

const cycle = (nextRenewalDate: string, elapsedPercent = 0.5) => ({
  cycleStart: "2026-06-16",
  cycleEnd: nextRenewalDate,
  nextRenewalDate,
  elapsedPercent,
  remainingDays: 15,
  totalDays: 30,
});

test("rollup collapses last-30 cycle slices into one row per tool", () => {
  const rows = rollupSubscriptionCyclesByTool([
    {
      id: "sub-a:2026-06-16",
      subscriptionId: "sub-a",
      name: "Plus",
      toolName: "codex",
      toolKey: "chatgpt-codex",
      cycleSpend: 19.33,
      verifiedUsageCost: 10,
      estimatedApiCost: 20,
      modelCalls: 7700,
      windowFrom: "2026-06-16",
      windowTo: "2026-07-15",
      billingCycle: cycle("2026-07-16"),
    },
    {
      id: "sub-a:2026-07-16",
      subscriptionId: "sub-a",
      name: "Plus",
      toolName: "codex",
      toolKey: "chatgpt-codex",
      cycleSpend: 0.645,
      verifiedUsageCost: 1,
      estimatedApiCost: 2,
      modelCalls: 586,
      windowFrom: "2026-07-16",
      windowTo: "2026-07-16",
      billingCycle: cycle("2026-08-16", 0.03),
    },
    {
      id: "sub-b:2026-06-16",
      subscriptionId: "sub-b",
      name: "Pro+",
      toolName: "cursor",
      toolKey: "cursor",
      cycleSpend: 58,
      verifiedUsageCost: 5,
      estimatedApiCost: 8,
      modelCalls: 1500,
      windowFrom: "2026-06-16",
      windowTo: "2026-07-15",
      billingCycle: cycle("2026-07-16"),
    },
    {
      id: "sub-b:2026-07-16",
      subscriptionId: "sub-b",
      name: "Pro+",
      toolName: "cursor",
      toolKey: "cursor",
      cycleSpend: 1.94,
      verifiedUsageCost: 0.5,
      estimatedApiCost: 1,
      modelCalls: 1,
      windowFrom: "2026-07-16",
      windowTo: "2026-07-16",
      billingCycle: cycle("2026-08-16", 0.03),
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.toolKey, "cursor");
  assert.equal(rows[0]?.cycleSpend, 59.94);
  assert.equal(rows[0]?.modelCalls, 1501);
  assert.equal(rows[0]?.planCount, 1);
  assert.deepEqual(rows[0]?.planNames, ["Pro+"]);
  assert.equal(rows[0]?.windowFrom, "2026-06-16");
  assert.equal(rows[0]?.windowTo, "2026-07-16");

  assert.equal(rows[1]?.toolKey, "chatgpt-codex");
  assert.ok(Math.abs((rows[1]?.cycleSpend ?? 0) - 19.975) < 1e-9);
  assert.equal(rows[1]?.modelCalls, 8286);
  assert.equal(Math.round(rows[0]!.spendSharePercent + rows[1]!.spendSharePercent), 100);
});

test("rollup merges multiple plans under the same tool", () => {
  const rows = rollupSubscriptionCyclesByTool([
    {
      id: "plus:2026-07-16",
      subscriptionId: "plus",
      name: "Plus",
      toolName: "codex",
      toolKey: "chatgpt-codex",
      cycleSpend: 20,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 100,
      windowFrom: "2026-07-16",
      windowTo: "2026-08-15",
      billingCycle: cycle("2026-08-16", 0.1),
    },
    {
      id: "team:2026-07-01",
      subscriptionId: "team",
      name: "Team",
      toolName: "codex",
      toolKey: "chatgpt-codex",
      cycleSpend: 40,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 200,
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      billingCycle: cycle("2026-08-01", 0.5),
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.planCount, 2);
  assert.deepEqual(rows[0]?.planNames, ["Plus", "Team"]);
  assert.equal(rows[0]?.cycleSpend, 60);
  assert.equal(rows[0]?.modelCalls, 300);
  assert.equal(rows[0]?.billingCycle.nextRenewalDate, "2026-08-01");
  assert.equal(rows[0]?.spendSharePercent, 100);
});

test("active cycle filter hides unused seats with no quota signal", () => {
  const filtered = filterActiveSubscriptionCycles([
    {
      id: "cursor",
      toolName: "cursor",
      toolKey: "cursor",
      planNames: ["Pro+"],
      planCount: 1,
      cycleSpend: 60,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 117,
      windowFrom: "2026-07-16",
      windowTo: "2026-08-15",
      spendSharePercent: 60,
      utilizationPercent: 1,
      utilizationDisplayPercent: 1,
      verdictCode: "LIGHT_USE",
      billingCycle: cycle("2026-08-16"),
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
      windowFrom: "2026-07-16",
      windowTo: "2026-08-15",
      spendSharePercent: 20,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: "UNKNOWN",
      billingCycle: cycle("2026-08-17"),
    },
    {
      id: "copilot",
      toolName: "copilot",
      toolKey: "github-copilot",
      planNames: ["Free"],
      planCount: 1,
      cycleSpend: 0,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 0,
      windowFrom: "2026-07-16",
      windowTo: "2026-08-15",
      spendSharePercent: 0,
      utilizationPercent: 0,
      utilizationDisplayPercent: 0,
      verdictCode: "LIGHT_USE",
      billingCycle: cycle("2026-08-17"),
    },
  ]);

  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((row) => row.toolKey),
    ["cursor", "github-copilot"],
  );
  assert.equal(Math.round(filtered[0]!.spendSharePercent), 100);
  assert.equal(filtered[1]!.spendSharePercent, 0);
});

test("previous cycles enrichment ignores live quota pace", () => {
  const cycles = [
    {
      id: "cursor",
      toolName: "cursor",
      toolKey: "cursor",
      planNames: ["Pro+"],
      planCount: 1,
      cycleSpend: 60,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 10,
      windowFrom: "2026-06-15",
      windowTo: "2026-07-14",
      spendSharePercent: 100,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      billingCycle: cycle("2026-07-15"),
    },
  ];
  const plan: PlanUsageSubscriptionRow = {
    planTemplateId: "cursor",
    toolKey: "cursor",
    toolName: "cursor",
    planName: "Pro+",
    tier: "Pro+",
    seatCapacity: 1,
    assignedSeats: 1,
    availableSeats: 0,
    billingCadence: "monthly",
    billingCycle: cycle("2026-08-15"),
    cycleSeatMicros: "60000000",
    includedCycleMicros: "0",
    primaryQuota: {
      quotaKey: "cursor:plan",
      label: "plan",
      unit: "percent",
      limit: null,
      consumed: null,
      remaining: null,
      rawRatio: 0.64,
      displayRatio: 0.64,
      periodStartsAt: null,
      resetsAt: null,
      source: "provider",
      observedAt: "2026-07-18T00:00:00.000Z",
      stale: false,
      toolKey: "cursor",
      windowType: "plan",
      developerId: null,
    },
    quotas: [],
    included: null,
    primaryRatio: 0.64,
    verdict: {
      code: "HEALTHY",
      severity: "info",
      reasons: [],
      policyVersion: "plan-utilization-v1",
    },
    billing: null,
  };

  const live = enrichSubscriptionCyclesWithUtilization(cycles, [plan], { includeLiveQuota: true });
  assert.equal(live[0]?.utilizationPercent, 64);
  assert.equal(live[0]?.verdictCode, "HEALTHY");

  const previous = enrichSubscriptionCyclesWithUtilization(cycles, [plan], { includeLiveQuota: false });
  assert.equal(previous[0]?.utilizationPercent, null);
  assert.equal(previous[0]?.verdictCode, null);
});
