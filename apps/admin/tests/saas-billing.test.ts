import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";
import {
  BLOCK_CHECKOUT_STATUSES,
  DEVICE_LIMIT_FREE,
  getDeviceLimit,
  getTrialDaysLeft,
  isPaidPlan,
  resolveEffectivePlan,
  TEAM_PRICE_PER_DEV_USD,
  TRIAL_DAYS,
} from "../lib/saas-billing/entitlements";
import {
  evaluateSeatCapacity,
  MAX_TEAM_SEATS,
  resolveCheckoutQuantity,
} from "../lib/saas-billing/seats";

test("keeps trial while trialEndsAt is in the future", () => {
  const plan = resolveEffectivePlan({
    plan: "trial",
    trialEndsAt: new Date(Date.now() + 86_400_000),
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
  assert.equal(plan, "trial");
  assert.equal(getDeviceLimit(plan), DEVICE_LIMIT_FREE);
});

test("falls back to community when trial ends", () => {
  const plan = resolveEffectivePlan({
    plan: "trial",
    trialEndsAt: new Date(Date.now() - 1_000),
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
  assert.equal(plan, "community");
  assert.equal(getDeviceLimit(plan), DEVICE_LIMIT_FREE);
});

test("treats team with paid statuses as unlimited devices", () => {
  for (const subscriptionStatus of ["active", "on_trial", "cancelled", "paused"]) {
    const plan = resolveEffectivePlan({
      plan: "team",
      trialEndsAt: null,
      subscriptionStatus,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    assert.equal(plan, "team");
    assert.equal(getDeviceLimit(plan), null);
    assert.equal(isPaidPlan(plan), true);
  }
});

test("blocks duplicate checkout only for active-like statuses", () => {
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("active"), true);
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("paused"), true);
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("cancelled"), false);
});

test("exports single-source pricing constants", () => {
  assert.equal(TRIAL_DAYS, 14);
  assert.equal(DEVICE_LIMIT_FREE, 10);
  assert.equal(TEAM_PRICE_PER_DEV_USD, 12);
});

test("reports trial days left", () => {
  assert.equal(getTrialDaysLeft(null), null);
  assert.equal(getTrialDaysLeft(new Date(Date.now() - 1_000)), 0);
  assert.ok((getTrialDaysLeft(new Date(Date.now() + 2 * 86_400_000)) ?? 0) >= 2);
});

test("lemon webhook signature digests differ for wrong secrets", () => {
  const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
  const good = createHmac("sha256", "test-secret").update(body).digest("hex");
  const bad = createHmac("sha256", "other").update(body).digest("hex");
  assert.notEqual(good, bad);
  assert.equal(good.length, bad.length);
});

test("resolveCheckoutQuantity defaults to roster floor", () => {
  const resolved = resolveCheckoutQuantity({ activeDeveloperCount: 10 });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.quantity, 10);
    assert.equal(resolved.minSeats, 10);
  }
});

test("resolveCheckoutQuantity allows buying ahead of free-tier roster (10 → 12)", () => {
  const resolved = resolveCheckoutQuantity({ activeDeveloperCount: 10, requested: 12 });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.quantity, 12);
});

test("resolveCheckoutQuantity rejects quantity below roster", () => {
  const resolved = resolveCheckoutQuantity({ activeDeveloperCount: 10, requested: 8 });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.match(resolved.error, /at least 10/);
    assert.equal(resolved.minSeats, 10);
  }
});

test("resolveCheckoutQuantity rejects over max", () => {
  const resolved = resolveCheckoutQuantity({
    activeDeveloperCount: 1,
    requested: MAX_TEAM_SEATS + 1,
  });
  assert.equal(resolved.ok, false);
});

test("resolveCheckoutQuantity uses at least 1 when roster empty", () => {
  const resolved = resolveCheckoutQuantity({ activeDeveloperCount: 0 });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.quantity, 1);
});

test("evaluateSeatCapacity allows unpaid plans", () => {
  const decision = evaluateSeatCapacity({
    isPaidPlan: false,
    purchasedSeats: null,
    activeDeveloperCount: 50,
    wouldConsumeSeat: true,
  });
  assert.equal(decision.allowed, true);
});

test("evaluateSeatCapacity allows re-link without consuming a seat", () => {
  const decision = evaluateSeatCapacity({
    isPaidPlan: true,
    purchasedSeats: 2,
    activeDeveloperCount: 2,
    wouldConsumeSeat: false,
  });
  assert.equal(decision.allowed, true);
});

test("evaluateSeatCapacity blocks when Team is at capacity", () => {
  const decision = evaluateSeatCapacity({
    isPaidPlan: true,
    purchasedSeats: 10,
    activeDeveloperCount: 10,
    wouldConsumeSeat: true,
  });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.match(decision.message, /All 10 seats/);
});

test("evaluateSeatCapacity allows when seats remain", () => {
  const decision = evaluateSeatCapacity({
    isPaidPlan: true,
    purchasedSeats: 12,
    activeDeveloperCount: 10,
    wouldConsumeSeat: true,
  });
  assert.equal(decision.allowed, true);
});

test("evaluateSeatCapacity blocks paid org with no purchased quantity", () => {
  const decision = evaluateSeatCapacity({
    isPaidPlan: true,
    purchasedSeats: null,
    activeDeveloperCount: 1,
    wouldConsumeSeat: true,
  });
  assert.equal(decision.allowed, false);
});
