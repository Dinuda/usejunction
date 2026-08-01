import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCycleView } from "../lib/dashboard/cycle-view";
import { DEFAULT_ROLLING_PERIOD, parseRollingPeriodFromSearch } from "../lib/dashboard/period-prefs";

/** Mirrors parseMemberCycleSearch in member-page-context.ts */
function memberCycleSearch(params: { view?: string; days?: string; from?: string; to?: string }) {
  return {
    cycleView: parseCycleView(params.view ?? undefined),
    rollingPeriod: parseRollingPeriodFromSearch(params),
  };
}

test("parseMemberCycleSearch defaults to current_cycles", () => {
  assert.deepEqual(memberCycleSearch({}), {
    cycleView: "current_cycles",
    rollingPeriod: DEFAULT_ROLLING_PERIOD,
  });
});

test("parseMemberCycleSearch respects explicit view params", () => {
  assert.equal(memberCycleSearch({ view: "last_30_days" }).cycleView, "last_30_days");
  assert.equal(memberCycleSearch({ view: "previous_cycles" }).cycleView, "previous_cycles");
});
