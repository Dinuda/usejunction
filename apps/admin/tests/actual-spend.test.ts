import assert from "node:assert/strict";
import test from "node:test";
import {
  computeActualSpend,
  filterMonthlyCodingSubscriptions,
  monthlySubscriptionMicros,
  subscriptionActiveInPeriod,
} from "../lib/billing/actual-spend";
import { isCodingTool } from "../lib/tools/catalog";

test("monthly subscription cost is not prorated by days in the window", () => {
  const micros = monthlySubscriptionMicros(
    [
      {
        monthlySeatMicros: BigInt(80_000_000),
        seatCount: 2,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
      },
    ],
    new Date("2026-06-15T00:00:00.000Z"),
    new Date("2026-07-14T00:00:00.000Z"),
  );
  assert.equal(micros, BigInt(160_000_000));
});

test("subscription is excluded before its known start", () => {
  const row = {
    monthlySeatMicros: BigInt(80_000_000),
    seatCount: 1,
    startDate: new Date("2026-07-10T00:00:00.000Z"),
    endDate: null,
  };
  assert.equal(
    subscriptionActiveInPeriod(row, new Date("2026-06-01T00:00:00.000Z"), new Date("2026-07-09T00:00:00.000Z")),
    false,
  );
  assert.equal(
    subscriptionActiveInPeriod(row, new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-31T00:00:00.000Z")),
    true,
  );
});

test("computeActualSpend returns full monthly dollars once subscription has started", () => {
  const spend = computeActualSpend({
    subscriptions: [
      {
        monthlySeatMicros: BigInt(80_000_000),
        seatCount: 2,
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: null,
      },
    ],
    from: new Date("2026-06-15T00:00:00.000Z"),
    to: new Date("2026-07-14T00:00:00.000Z"),
  });
  assert.equal(spend.basis, "subscriptions");
  assert.equal(spend.total, 160);
});

test("7d and 30d windows show the same monthly subscription total", () => {
  const subscriptions = [
    {
      monthlySeatMicros: BigInt(40_000_000),
      seatCount: 2,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
    },
  ];
  const sevenDay = computeActualSpend({
    subscriptions,
    from: new Date("2026-07-08T00:00:00.000Z"),
    to: new Date("2026-07-14T00:00:00.000Z"),
  });
  const thirtyDay = computeActualSpend({
    subscriptions,
    from: new Date("2026-06-15T00:00:00.000Z"),
    to: new Date("2026-07-14T00:00:00.000Z"),
  });
  assert.equal(sevenDay.total, 80);
  assert.equal(thirtyDay.total, 80);
});

test("filterMonthlyCodingSubscriptions keeps only monthly catalog coding tools", () => {
  const filtered = filterMonthlyCodingSubscriptions(
    [
      { billingCadence: "monthly", toolKey: "cursor", toolName: "cursor" },
      { billingCadence: "annual", toolKey: "cursor", toolName: "cursor" },
      { billingCadence: "monthly", toolKey: "slack", toolName: "slack" },
      { billingCadence: "custom", toolKey: "claude", toolName: "claude" },
      { billingCadence: "monthly", toolKey: "github-copilot", toolName: "copilot" },
    ],
    isCodingTool,
  );
  assert.deepEqual(
    filtered.map((row) => row.toolKey),
    ["cursor", "github-copilot"],
  );
});
