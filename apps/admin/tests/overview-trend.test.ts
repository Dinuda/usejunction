import assert from "node:assert/strict";
import { test } from "vitest";
import { fillOverviewTrend } from "../lib/insights/policies/overview-trend";

test("fillOverviewTrend calendar-aligns previous rolling window", () => {
  const points = fillOverviewTrend(
    3,
    new Date("2026-07-16T00:00:00.000Z"),
    [
      { date: "2026-07-16", modelCalls: 10, cost: 1 },
      { date: "2026-07-17", modelCalls: 20, cost: 2 },
      { date: "2026-07-18", modelCalls: 30, cost: 3 },
    ],
    [
      { date: "2026-07-13", modelCalls: 1, cost: 0.1 },
      { date: "2026-07-14", modelCalls: 2, cost: 0.2 },
      { date: "2026-07-15", modelCalls: 3, cost: 0.3 },
    ],
    { align: "calendar" },
  );
  assert.equal(points[0]?.date, "2026-07-16");
  assert.equal(points[0]?.previousDate, "2026-07-13");
  assert.equal(points[0]?.previousRequests, 1);
  assert.equal(points[2]?.previousDate, "2026-07-15");
  assert.equal(points[2]?.previousRequests, 3);
});

test("fillOverviewTrend index-aligns previous billing cycle of different length", () => {
  const points = fillOverviewTrend(
    7,
    new Date("2026-07-18T00:00:00.000Z"),
    [
      { date: "2026-07-18", modelCalls: 5, cost: 1 },
      { date: "2026-07-19", modelCalls: 6, cost: 1 },
    ],
    [
      { date: "2026-07-11", modelCalls: 50, cost: 2 },
      { date: "2026-07-12", modelCalls: 60, cost: 2 },
    ],
    { align: "index", previousFrom: new Date("2026-07-11T00:00:00.000Z") },
  );
  assert.equal(points[0]?.date, "2026-07-18");
  assert.equal(points[0]?.previousDate, "2026-07-11");
  assert.equal(points[0]?.previousRequests, 50);
  assert.equal(points[1]?.previousDate, "2026-07-12");
  assert.equal(points[1]?.previousRequests, 60);
  assert.equal(points[2]?.previousDate, "2026-07-13");
  assert.equal(points[2]?.previousRequests, 0);
});
