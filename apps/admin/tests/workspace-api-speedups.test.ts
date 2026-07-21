import { test } from "vitest";
import assert from "node:assert/strict";
import { fillWorkOverviewTrendForTests } from "../lib/signals/readers/work-sessions";
import { catalogToolDetectedWithoutPlanForTests } from "../lib/queries/me/local-sync-context";

test("fillWorkOverviewTrend fills empty UTC days in the window", () => {
  const trend = fillWorkOverviewTrendForTests(
    [{ date: "2026-07-20", sessions: 3, people: 2 }],
    { from: new Date("2026-07-19T00:00:00.000Z"), to: new Date("2026-07-21T00:00:00.000Z") },
  );
  assert.deepEqual(
    trend.map((row) => ({ date: row.date, sessions: row.sessions, people: row.people })),
    [
      { date: "2026-07-19", sessions: 0, people: 0 },
      { date: "2026-07-20", sessions: 3, people: 2 },
      { date: "2026-07-21", sessions: 0, people: 0 },
    ],
  );
});

test("fillWorkOverviewTrend returns all zeros for an empty window", () => {
  const trend = fillWorkOverviewTrendForTests([], {
    from: new Date("2026-07-01T00:00:00.000Z"),
    to: new Date("2026-07-02T00:00:00.000Z"),
  });
  assert.equal(trend.length, 2);
  assert.ok(trend.every((row) => row.sessions === 0 && row.people === 0 && row.durationSeconds === 0));
});

test("catalogToolDetectedWithoutPlan is true when a catalog install has no plan", () => {
  assert.equal(
    catalogToolDetectedWithoutPlanForTests({
      installations: [{ toolName: "cursor" }],
      accounts: [{ toolName: "cursor", plan: null }],
    }),
    true,
  );
});

test("catalogToolDetectedWithoutPlan is false when the catalog install has a plan", () => {
  assert.equal(
    catalogToolDetectedWithoutPlanForTests({
      installations: [{ toolName: "cursor" }],
      accounts: [{ toolName: "cursor", plan: "Pro" }],
    }),
    false,
  );
});

test("catalogToolDetectedWithoutPlan ignores non-catalog tools", () => {
  assert.equal(
    catalogToolDetectedWithoutPlanForTests({
      installations: [{ toolName: "custom-local-tool" }],
      accounts: [],
    }),
    false,
  );
});
