import assert from "node:assert/strict";
import { test } from "vitest";
import { reportWindowForCycleOffset, reportWindowForCycleView } from "../lib/dashboard/cycle-view";

const monthlyPlan = {
  billingCadence: "monthly",
  billingCycleAnchorDate: new Date("2026-06-18T00:00:00.000Z"),
  billingCycleDays: null,
  createdAt: null,
};

test("reportWindowForCycleOffset returns current vs previous billing windows", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const current = reportWindowForCycleOffset([monthlyPlan], 0, now);
  const previous = reportWindowForCycleOffset([monthlyPlan], -1, now);

  assert.equal(current.from.toISOString(), "2026-07-18T00:00:00.000Z");
  assert.equal(current.to.toISOString(), "2026-08-17T00:00:00.000Z");
  assert.equal(previous.from.toISOString(), "2026-06-18T00:00:00.000Z");
  assert.equal(previous.to.toISOString(), "2026-07-17T00:00:00.000Z");
  assert.notEqual(current.from.toISOString(), previous.from.toISOString());
});

test("reportWindowForCycleOffset unions mixed weekly and monthly plans", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const weekly = {
    billingCadence: "weekly",
    billingCycleAnchorDate: new Date("2026-07-18T00:00:00.000Z"),
    billingCycleDays: null,
    createdAt: null,
  };
  const monthly = {
    billingCadence: "monthly",
    billingCycleAnchorDate: new Date("2026-07-15T00:00:00.000Z"),
    billingCycleDays: null,
    createdAt: null,
  };
  const current = reportWindowForCycleOffset([weekly, monthly], 0, now);
  const previous = reportWindowForCycleOffset([weekly, monthly], -1, now);

  assert.equal(current.from.toISOString(), "2026-07-15T00:00:00.000Z");
  assert.equal(current.to.toISOString(), "2026-08-14T00:00:00.000Z");
  assert.equal(previous.from.toISOString(), "2026-06-15T00:00:00.000Z");
  assert.notEqual(current.from.toISOString(), previous.from.toISOString());
});

test("reportWindowForCycleOffset uses contiguous 30-day fallbacks without plans", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const current = reportWindowForCycleOffset([], 0, now);
  const previous = reportWindowForCycleOffset([], -1, now);
  const twoBack = reportWindowForCycleOffset([], -2, now);

  assert.equal(current.from.toISOString(), "2026-06-19T00:00:00.000Z");
  assert.equal(current.to.toISOString(), "2026-07-18T00:00:00.000Z");
  assert.equal(previous.from.toISOString(), "2026-05-20T00:00:00.000Z");
  assert.equal(previous.to.toISOString(), "2026-06-18T00:00:00.000Z");
  assert.equal(twoBack.to.toISOString(), "2026-05-19T00:00:00.000Z");
});

test("reportWindowForCycleView maps views onto cycle offsets", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const current = reportWindowForCycleView("current_cycles", { kind: "preset", days: 30 }, [monthlyPlan], now);
  const previous = reportWindowForCycleView("previous_cycles", { kind: "preset", days: 30 }, [monthlyPlan], now);

  assert.equal(current.from.toISOString(), "2026-07-18T00:00:00.000Z");
  assert.equal(previous.from.toISOString(), "2026-06-18T00:00:00.000Z");
});
