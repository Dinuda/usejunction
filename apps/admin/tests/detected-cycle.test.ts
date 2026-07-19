import assert from "node:assert/strict";
import { test } from "vitest";
import { cycleFromNextRenewal, resolveBillingCycle } from "../lib/billing/cycles";
import {
  cadenceFromQuotaWindow,
  detectedCycleFromQuotas,
  detectedCycleSeatMicros,
  selectCycleQuota,
  subscriptionBillingCadence,
} from "../lib/tools/detected-cycle";
import { deriveSubscription } from "../lib/tools/subscriptions";

test("cadenceFromQuotaWindow maps weekly and cursor monthly family", () => {
  assert.equal(cadenceFromQuotaWindow("weekly"), "weekly");
  assert.equal(cadenceFromQuotaWindow("plan"), "monthly");
  assert.equal(cadenceFromQuotaWindow("api"), "monthly");
  assert.equal(cadenceFromQuotaWindow("auto"), "monthly");
});

test("ChatGPT/Codex subscription billing is always monthly", () => {
  assert.equal(subscriptionBillingCadence("chatgpt-codex", "weekly"), "monthly");
  assert.equal(subscriptionBillingCadence("cursor", "plan"), "monthly");
  assert.equal(subscriptionBillingCadence("cursor", "weekly"), "weekly");
});

test("selectCycleQuota prefers newest reset among same-rank windows", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const primary = selectCycleQuota([
    {
      toolName: "codex",
      windowType: "weekly",
      usedPercent: 64,
      resetAt: new Date("2026-07-23T07:10:20.000Z"),
      updatedAt: new Date("2026-07-17T11:31:26.000Z"),
    },
    {
      toolName: "codex",
      windowType: "weekly",
      usedPercent: 3,
      resetAt: new Date("2026-07-25T09:22:46.000Z"),
      updatedAt: now,
    },
    {
      toolName: "codex",
      windowType: "session_5h",
      usedPercent: 90,
      resetAt: new Date("2026-07-23T07:10:21.000Z"),
      updatedAt: now,
    },
  ]);
  assert.equal(primary?.resetAt?.toISOString(), "2026-07-25T09:22:46.000Z");
});

test("detectedCycleFromQuotas: Cursor plan reset Aug 15 → monthly Jul 15", () => {
  const hint = detectedCycleFromQuotas(
    [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 8,
        resetAt: new Date("2026-08-15T07:02:06.000Z"),
        updatedAt: new Date("2026-07-18T16:46:27.000Z"),
      },
    ],
    { toolKey: "cursor" },
  );
  assert.equal(hint.billingCadence, "monthly");
  assert.equal(hint.nextRenewalDate?.toISOString().slice(0, 10), "2026-08-15");
  const anchor = cycleFromNextRenewal({
    nextRenewalDate: hint.nextRenewalDate!,
    billingCadence: "monthly",
  });
  assert.equal(anchor.toISOString().slice(0, 10), "2026-07-15");
  const cycle = resolveBillingCycle(
    { billingCadence: "monthly", billingCycleAnchorDate: anchor, createdAt: null },
    new Date("2026-07-18T12:00:00.000Z"),
  );
  assert.equal(cycle.cycleStart.toISOString().slice(0, 10), "2026-07-15");
  assert.equal(cycle.cycleEnd.toISOString().slice(0, 10), "2026-08-15");
});

test("detectedCycleFromQuotas: ChatGPT weekly quota does not become Plus renewal", () => {
  const hint = detectedCycleFromQuotas(
    [
      {
        toolName: "codex",
        windowType: "weekly",
        usedPercent: 3,
        resetAt: new Date("2026-07-25T09:22:46.000Z"),
        updatedAt: new Date("2026-07-18T16:46:27.000Z"),
      },
    ],
    { toolKey: "chatgpt-codex" },
  );
  assert.equal(hint.billingCadence, "monthly");
  assert.equal(hint.nextRenewalDate, null);
  assert.equal(hint.windowType, null);
});

test("deriveSubscription prices ChatGPT Plus monthly from catalog", () => {
  const micros = detectedCycleSeatMicros("chatgpt-codex", "plus", "monthly");
  assert.equal(micros, BigInt(20_000_000));
  const derived = deriveSubscription({
    toolKey: "chatgpt-codex",
    planKey: "plus",
    billingCadence: "monthly",
    billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
    seatCapacity: 1,
    cycleSeatMicros: micros,
  });
  assert.equal(derived.billingCadence, "monthly");
  assert.equal(derived.billingCycleAnchorDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(derived.cycleSeatMicros, BigInt(20_000_000));
});
