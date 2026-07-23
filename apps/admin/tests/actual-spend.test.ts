import assert from "node:assert/strict";
import { test } from "vitest";
import {
  computeActualSpend,
  computePersonalSeatCommitment,
  cycleSubscriptionMicros,
  filterCycleCodingSubscriptions,
  subscriptionActiveInPeriod,
} from "../lib/billing/actual-spend";
import { resolveBillingCycle } from "../lib/billing/cycles";
import { isCodingTool } from "../lib/tools/catalog";

const base = {
  billingCycleAnchorDate: new Date("2026-07-08T00:00:00.000Z"),
  billingCycleDays: null,
  startDate: new Date("2026-07-08T00:00:00.000Z"),
  endDate: null,
};

test("billing cycles resolve monthly, weekly, annual, and custom boundaries", () => {
  assert.deepEqual(resolveBillingCycle({ ...base, billingCadence: "monthly" }, new Date("2026-07-15T00:00:00.000Z")), {
    cycleStart: new Date("2026-07-08T00:00:00.000Z"),
    cycleEnd: new Date("2026-08-08T00:00:00.000Z"),
    nextRenewalDate: new Date("2026-08-08T00:00:00.000Z"),
    elapsedPercent: 8 / 31,
    remainingDays: 24,
    totalDays: 31,
  });
  assert.equal(resolveBillingCycle({ ...base, billingCadence: "weekly" }, new Date("2026-07-15T00:00:00.000Z")).cycleStart.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(resolveBillingCycle({ ...base, billingCadence: "annual" }, new Date("2027-01-01T00:00:00.000Z")).cycleEnd.toISOString().slice(0, 10), "2027-07-08");
  assert.equal(resolveBillingCycle({ ...base, billingCadence: "custom", billingCycleDays: 10 }, new Date("2026-07-29T00:00:00.000Z")).cycleStart.toISOString().slice(0, 10), "2026-07-28");
});

test("cycle subscription cost is not prorated by days in the window", () => {
  const micros = cycleSubscriptionMicros(
    [
      {
        ...base,
        billingCadence: "monthly",
        cycleSeatMicros: BigInt(80_000_000),
        seatCount: 2,
      },
    ],
    new Date("2026-07-15T00:00:00.000Z"),
    new Date("2026-07-21T00:00:00.000Z"),
  );
  assert.equal(micros, BigInt(160_000_000));
});

test("subscription is excluded before its known start", () => {
  const row = {
    ...base,
    billingCadence: "monthly",
    cycleSeatMicros: BigInt(80_000_000),
    seatCount: 1,
    startDate: new Date("2026-07-10T00:00:00.000Z"),
  };
  assert.equal(
    subscriptionActiveInPeriod(row, new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-09T00:00:00.000Z")),
    false,
  );
  assert.equal(
    subscriptionActiveInPeriod(row, new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-31T00:00:00.000Z")),
    true,
  );
});

test("computeActualSpend returns full cycle dollars for mixed cadences", () => {
  const spend = computeActualSpend({
    subscriptions: [
      { ...base, billingCadence: "monthly", cycleSeatMicros: BigInt(80_000_000), seatCount: 2 },
      { ...base, billingCadence: "weekly", cycleSeatMicros: BigInt(10_000_000), seatCount: 1 },
      { ...base, billingCadence: "annual", cycleSeatMicros: BigInt(192_000_000), seatCount: 1 },
    ],
    from: new Date("2026-07-15T00:00:00.000Z"),
    to: new Date("2026-07-15T00:00:00.000Z"),
    now: new Date("2026-07-15T00:00:00.000Z"),
  });
  assert.equal(spend.basis, "subscriptions");
  assert.equal(spend.total, 362);
  assert.equal(spend.cycles.length, 3);
});

test("filterCycleCodingSubscriptions keeps all coding cadences", () => {
  const filtered = filterCycleCodingSubscriptions(
    [
      { billingCadence: "weekly", toolKey: "cursor", toolName: "cursor" },
      { billingCadence: "annual", toolKey: "cursor", toolName: "cursor" },
      { billingCadence: "monthly", toolKey: "slack", toolName: "slack" },
      { billingCadence: "custom", toolKey: "claude", toolName: "claude" },
      { billingCadence: "monthly", toolKey: "github-copilot", toolName: "copilot" },
    ],
    isCodingTool,
  );
  assert.deepEqual(
    filtered.map((row) => row.toolKey),
    ["cursor", "cursor", "claude", "github-copilot"],
  );
});

test("computePersonalSeatCommitment uses full cycle for current view and prorates last_30_days", () => {
  const assignment = {
    ...base,
    billingCadence: "monthly" as const,
    cycleSeatMicros: BigInt(310_000_000),
    seatCount: 1,
  };

  assert.equal(
    computePersonalSeatCommitment({
      assignments: [assignment],
      view: "current_cycles",
      from: new Date("2026-07-08T00:00:00.000Z"),
      to: new Date("2026-08-07T00:00:00.000Z"),
    }),
    310,
  );

  // 10 of 31 days in the July cycle → ~$100
  assert.equal(
    computePersonalSeatCommitment({
      assignments: [assignment],
      view: "last_30_days",
      from: new Date("2026-07-08T00:00:00.000Z"),
      to: new Date("2026-07-17T00:00:00.000Z"),
    }),
    100,
  );
});
