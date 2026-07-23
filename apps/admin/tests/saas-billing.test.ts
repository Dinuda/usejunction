import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";
import {
  BLOCK_CHECKOUT_STATUSES,
  getUserLimit,
  isPaidPlan,
  resolveEffectivePlan,
  TEAM_PRICE_PER_DEV_USD,
  USER_LIMIT_FREE,
} from "../lib/saas-billing/entitlements";
import { activeSeatQuantity } from "../lib/saas-billing/seats";

test("resolves unpaid workspaces to community with a 5-user cap", () => {
  const plan = resolveEffectivePlan({
    plan: "community",
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
  assert.equal(plan, "community");
  assert.equal(getUserLimit(plan), USER_LIMIT_FREE);
});

test("treats legacy trial plan rows as community", () => {
  const plan = resolveEffectivePlan({
    plan: "trial",
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
  assert.equal(plan, "community");
  assert.equal(getUserLimit(plan), USER_LIMIT_FREE);
});

test("treats team with paid statuses as uncapped users", () => {
  for (const subscriptionStatus of ["active", "on_trial", "cancelled", "paused"]) {
    const plan = resolveEffectivePlan({
      plan: "team",
      subscriptionStatus,
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
    assert.equal(plan, "team");
    assert.equal(getUserLimit(plan), null);
    assert.equal(isPaidPlan(plan), true);
  }
});

test("blocks duplicate checkout only for active-like statuses", () => {
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("active"), true);
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("paused"), true);
  assert.equal(BLOCK_CHECKOUT_STATUSES.has("cancelled"), false);
});

test("exports single-source developer pricing constants", () => {
  assert.equal(USER_LIMIT_FREE, 5);
  assert.equal(TEAM_PRICE_PER_DEV_USD, 8);
});

test("lemon webhook signature digests differ for wrong secrets", () => {
  const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
  const good = createHmac("sha256", "test-secret").update(body).digest("hex");
  const bad = createHmac("sha256", "other").update(body).digest("hex");
  assert.notEqual(good, bad);
  assert.equal(good.length, bad.length);
});

test("activeSeatQuantity follows the roster with a one-seat minimum", () => {
  assert.equal(activeSeatQuantity(10), 10);
  assert.equal(activeSeatQuantity(1), 1);
  assert.equal(activeSeatQuantity(0), 1);
  assert.throws(() => activeSeatQuantity(-1), /non-negative whole number/);
});
