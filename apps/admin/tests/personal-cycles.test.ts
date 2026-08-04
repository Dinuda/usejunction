import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { personalPlanCardsToCycles } from "@/lib/dashboard/personal-cycles";
import type { MemberPlanBoardCard } from "@/lib/quotas/plan-board";

function baseCard(overrides: Partial<MemberPlanBoardCard> = {}): MemberPlanBoardCard {
  return {
    toolKey: "cursor",
    toolName: "cursor",
    toolLabel: "Cursor",
    planName: "Pro+",
    usageWindowPreference: "auto",
    accountEmail: null,
    pace: {
      code: "ON_TRACK",
      toolKey: "cursor",
      toolLabel: "Cursor",
      windowType: "plan",
      windowLabel: "Plan",
      usedPercent: 73,
      expectedPercent: 50,
      daysToExhaust: 20,
      daysToReset: 15,
      exhaustAt: null,
      resetsAt: "2026-08-15T00:00:00.000Z",
      summary: "On track",
      projectionState: "reliable",
    },
    primary: {
      quotaKey: "cursor:plan",
      windowType: "plan",
      windowLabel: "Plan",
      kind: "plan",
      usedPercent: 73,
      remaining: null,
      remainingLabel: null,
      resetsAt: "2026-08-15T00:00:00.000Z",
      signal: "73%",
      stale: false,
      observedAt: "2026-08-03T00:00:00.000Z",
    },
    promotions: [],
    otherWindows: [],
    quotaSyncedAt: "2026-08-03T00:00:00.000Z",
    billingCycle: {
      cycleStart: "2026-07-23T00:00:00.000Z",
      cycleEnd: "2026-08-23T00:00:00.000Z",
      nextRenewalDate: "2026-08-23T00:00:00.000Z",
      totalDays: 31,
      billingCadence: "monthly",
    },
    usage: {
      requests: 100,
      tokens: 1_000_000,
      inputTokens: 600_000,
      outputTokens: 400_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: 433.04,
      verifiedUsageCost: 433.04,
      estimatedApiCost: 0,
    },
    ...overrides,
  };
}

describe("personalPlanCardsToCycles", () => {
  it("maps plan cards into CoverageVsNeed cycle rows", () => {
    const rows = personalPlanCardsToCycles([baseCard()], { cursor: 120 }, new Date("2026-08-03T12:00:00Z"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.toolKey, "cursor");
    assert.equal(rows[0]?.utilizationPercent, 73);
    assert.equal(rows[0]?.verdictCode, "HEALTHY");
    assert.equal(rows[0]?.cycleSpend, 120);
    assert.equal(rows[0]?.verifiedUsageCost, 433.04);
    assert.equal(rows[0]?.billingCadence, "monthly");
    assert.equal(rows[0]?.usageWindow?.resetAt, "2026-08-15T00:00:00.000Z");
  });

  it("marks over-limit when used percent is 100+", () => {
    const rows = personalPlanCardsToCycles([
      baseCard({
        pace: {
          ...baseCard().pace,
          code: "ALREADY_EXCEEDED",
          usedPercent: 104,
        },
      }),
    ]);
    assert.equal(rows[0]?.verdictCode, "LIMIT_EXCEEDED");
  });
});
