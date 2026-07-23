import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { dayPlanUsedPercentFromAssignment } from "@/lib/reports/day-plan-usage";

describe("day plan usage", () => {
  test("computes daily plan percent from prorated cycle allowance", () => {
    const now = new Date("2026-07-23T14:30:00.000Z");
    const percent = dayPlanUsedPercentFromAssignment({
      costMicros: 5_000_000,
      assignment: {
        includedCycleMicros: BigInt(30_000_000),
        billingCadence: "monthly",
        billingCycleAnchorDate: new Date("2026-07-01T00:00:00.000Z"),
        billingCycleDays: null,
      },
      now,
    });
    assert.ok(percent != null && percent > 0);
  });

  test("returns null when included allowance is zero", () => {
    const percent = dayPlanUsedPercentFromAssignment({
      costMicros: 1_000_000,
      assignment: {
        includedCycleMicros: BigInt(0),
        billingCadence: "monthly",
        billingCycleAnchorDate: null,
        billingCycleDays: null,
      },
      now: new Date("2026-07-23T14:30:00.000Z"),
    });
    assert.equal(percent, null);
  });
});
