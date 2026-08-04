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
      expectedEndAt: null,
      billingCadence: "monthly",
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
      expectedEndAt: null,
      billingCadence: "monthly",
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
      expectedEndAt: null,
      billingCadence: "monthly",
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
      expectedEndAt: null,
      billingCadence: "monthly",
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
  assert.equal(live[0]?.expectedEndAt, null);

  const previous = enrichSubscriptionCyclesWithUtilization(cycles, [plan], { includeLiveQuota: false });
  assert.equal(previous[0]?.utilizationPercent, null);
  assert.equal(previous[0]?.verdictCode, null);
  assert.equal(previous[0]?.expectedEndAt, null);
});

test("live enrichment attaches expected end when plan is near limit", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
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
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      spendSharePercent: 100,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      expectedEndAt: null,
      billingCadence: "monthly",
      billingCycle: cycle("2026-08-01"),
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
    billingCycle: cycle("2026-08-01"),
    cycleSeatMicros: "60000000",
    includedCycleMicros: "0",
    primaryQuota: {
      quotaKey: "cursor:plan",
      label: "plan",
      unit: "percent",
      limit: null,
      consumed: null,
      remaining: null,
      rawRatio: 0.9,
      displayRatio: 0.9,
      periodStartsAt: "2026-07-01T00:00:00.000Z",
      resetsAt: "2026-08-01T00:00:00.000Z",
      source: "provider",
      observedAt: now.toISOString(),
      stale: false,
      toolKey: "cursor",
      windowType: "month",
      developerId: null,
    },
    quotas: [],
    included: null,
    primaryRatio: 0.9,
    verdict: {
      code: "NEAR_LIMIT",
      severity: "warning",
      reasons: ["pace_excess"],
      policyVersion: "plan-utilization-v1",
    },
    billing: null,
  };

  const live = enrichSubscriptionCyclesWithUtilization(cycles, [plan], {
    includeLiveQuota: true,
    now,
  });
  assert.equal(live[0]?.verdictCode, "NEAR_LIMIT");
  assert.ok(live[0]?.expectedEndAt);
  assert.ok(new Date(live[0]!.expectedEndAt!).getTime() < new Date("2026-08-01T00:00:00.000Z").getTime());
});

test("live rollups mark inconsistent quota windows as mixed and use the earliest reset", () => {
  const cycles = [
    {
      id: "chatgpt-codex",
      toolName: "codex",
      toolKey: "chatgpt-codex",
      planNames: ["Plus", "Pro"],
      planCount: 2,
      cycleSpend: 40,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 4,
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      spendSharePercent: 100,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      expectedEndAt: null,
      billingCadence: "monthly",
      billingCycle: cycle("2026-08-01"),
    },
  ];
  const makePlan = (id: string, windowType: string, resetAt: string) => ({
    planTemplateId: id,
    toolKey: "chatgpt-codex",
    toolName: "codex",
    planName: id,
    tier: "paid",
    seatCapacity: 1,
    assignedSeats: 1,
    availableSeats: 0,
    billingCadence: "monthly",
    usageWindowPreference: "auto",
    billingCycle: cycle("2026-08-01"),
    cycleSeatMicros: "20000000",
    includedCycleMicros: "0",
    primaryQuota: {
      rawRatio: 0.4,
      displayRatio: 0.4,
      resetsAt: resetAt,
      windowType,
      toolKey: "chatgpt-codex",
      stale: false,
    },
    quotas: [],
    included: null,
    primaryRatio: 0.4,
    projectionState: "forming",
    verdict: { code: "UNKNOWN", severity: "info", reasons: [], policyVersion: "plan-utilization-v1" },
    billing: null,
  }) as unknown as PlanUsageSubscriptionRow;

  const [row] = enrichSubscriptionCyclesWithUtilization(
    cycles,
    [
      makePlan("Plus", "weekly", "2026-08-02T10:00:00.000Z"),
      makePlan("Pro", "session_5h", "2026-07-26T19:00:00.000Z"),
    ],
    { now: new Date("2026-07-26T14:00:00.000Z") },
  );
  assert.equal(row?.usageWindow?.label, "Mixed usage windows");
  assert.equal(row?.usageWindow?.resetAt, "2026-07-26T19:00:00.000Z");
  assert.equal(row?.projectionState, "forming");
});

test("utilization averages plans weighted by assigned seats", () => {
  const cycles = [
    {
      id: "chatgpt",
      toolName: "chatgpt",
      toolKey: "chatgpt",
      planNames: ["Plus", "Team"],
      planCount: 2,
      cycleSpend: 40,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 10,
      windowFrom: "2026-07-01",
      windowTo: "2026-07-31",
      spendSharePercent: 100,
      utilizationPercent: null,
      utilizationDisplayPercent: null,
      verdictCode: null,
      expectedEndAt: null,
      billingCadence: "monthly",
      billingCycle: cycle("2026-08-01"),
      usageWindow: null,
      projectionState: "unavailable" as const,
    },
  ];

  const base = {
    toolKey: "chatgpt",
    toolName: "chatgpt",
    tier: null,
    availableSeats: 0,
    billingCadence: "monthly",
    usageWindowPreference: "auto",
    usageWindow: null,
    billingCycle: cycle("2026-08-01"),
    cycleSeatMicros: "0",
    includedCycleMicros: "0",
    quotas: [],
    included: null,
    projectionState: "reliable" as const,
    verdict: {
      code: "HEALTHY" as const,
      severity: "info" as const,
      reasons: [],
      policyVersion: "plan-utilization-v1",
    },
    billing: null,
  };

  const light: PlanUsageSubscriptionRow = {
    ...base,
    planTemplateId: "plus",
    planName: "Plus",
    seatCapacity: 1,
    assignedSeats: 1,
    primaryQuota: null,
    primaryRatio: 0.1,
  };
  const heavy: PlanUsageSubscriptionRow = {
    ...base,
    planTemplateId: "team",
    planName: "Team",
    seatCapacity: 9,
    assignedSeats: 9,
    primaryQuota: null,
    primaryRatio: 0.9,
    verdict: {
      code: "NEAR_LIMIT",
      severity: "warn",
      reasons: [],
      policyVersion: "plan-utilization-v1",
    },
  };

  const [row] = enrichSubscriptionCyclesWithUtilization(cycles, [light, heavy], {
    includeLiveQuota: true,
  });
  // (0.1*1 + 0.9*9) / 10 = 0.82 → 82%
  assert.equal(row?.utilizationPercent, 82);
  assert.equal(row?.verdictCode, "NEAR_LIMIT");
});

test("rollup prefers billing cycle from the longest seat period", () => {
  const weekly = {
    cycleStart: "2026-08-01",
    cycleEnd: "2026-08-08",
    nextRenewalDate: "2026-08-08",
    elapsedPercent: 0.2,
    remainingDays: 5,
    totalDays: 7,
  };
  const monthly = {
    cycleStart: "2026-07-15",
    cycleEnd: "2026-08-15",
    nextRenewalDate: "2026-08-15",
    elapsedPercent: 0.5,
    remainingDays: 15,
    totalDays: 30,
  };
  const rows = rollupSubscriptionCyclesByTool([
    {
      id: "weekly:2026-08-01",
      subscriptionId: "weekly",
      name: "Team weekly",
      toolName: "claude",
      toolKey: "claude",
      cycleSpend: 20,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 10,
      windowFrom: "2026-08-01",
      windowTo: "2026-08-08",
      billingCycle: weekly,
      billingCadence: "weekly",
    },
    {
      id: "monthly:2026-07-15",
      subscriptionId: "monthly",
      name: "Pro monthly",
      toolName: "claude",
      toolKey: "claude",
      cycleSpend: 40,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 20,
      windowFrom: "2026-07-15",
      windowTo: "2026-08-15",
      billingCycle: monthly,
      billingCadence: "monthly",
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.billingCadence, "monthly");
  assert.equal(rows[0]?.billingCycle.totalDays, 30);
  assert.equal(rows[0]?.billingCycle.nextRenewalDate, "2026-08-15");

  // Even when a weekly slice has higher seat spend, keep the longer monthly billed period.
  const weeklyPrimary = rollupSubscriptionCyclesByTool([
    {
      id: "weekly:2026-08-01",
      subscriptionId: "weekly",
      name: "Team weekly",
      toolName: "claude",
      toolKey: "claude",
      cycleSpend: 80,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 10,
      windowFrom: "2026-08-01",
      windowTo: "2026-08-08",
      billingCycle: weekly,
      billingCadence: "weekly",
    },
    {
      id: "monthly:2026-07-15",
      subscriptionId: "monthly",
      name: "Pro monthly",
      toolName: "claude",
      toolKey: "claude",
      cycleSpend: 20,
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      modelCalls: 20,
      windowFrom: "2026-07-15",
      windowTo: "2026-08-15",
      billingCycle: monthly,
      billingCadence: "monthly",
    },
  ]);
  assert.equal(weeklyPrimary[0]?.billingCadence, "monthly");
  assert.equal(weeklyPrimary[0]?.billingCycle.totalDays, 30);
});
