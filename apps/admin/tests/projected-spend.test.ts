import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  buildCycleCoverageRunways,
  buildCycleUsageNeedRows,
  buildProjectedSpendSeries,
  dateAtCycleProgress,
  projectCycleUtilization,
} from "@/lib/dashboard/projected-spend";

describe("buildProjectedSpendSeries", () => {
  it("projects remaining days from average daily burn", () => {
    const trend = [
      { date: "2026-05-01", previousDate: "2026-04-01", requests: 1, cost: 10, previousRequests: 0, previousCost: 0 },
      { date: "2026-05-02", previousDate: "2026-04-02", requests: 1, cost: 10, previousRequests: 0, previousCost: 0 },
      { date: "2026-05-03", previousDate: "2026-04-03", requests: 1, cost: 10, previousRequests: 0, previousCost: 0 },
      { date: "2026-05-04", previousDate: "2026-04-04", requests: 0, cost: 0, previousRequests: 0, previousCost: 0 },
    ];

    const series = buildProjectedSpendSeries(trend, 50, { today: "2026-05-02" });

    assert.equal(series.actualSpend, 20);
    assert.equal(series.projectedSpend, 40);
    assert.equal(series.todayIndex, 1);
    assert.equal(series.complete, false);
    assert.equal(series.points[1]?.actual, 20);
    assert.equal(series.points[1]?.projected, 20);
    assert.equal(series.points[3]?.actual, null);
    assert.equal(series.points[3]?.projected, 40);
  });

  it("treats fully past windows as complete", () => {
    const trend = [
      { date: "2026-04-01", previousDate: "2026-03-01", requests: 1, cost: 5, previousRequests: 0, previousCost: 0 },
      { date: "2026-04-02", previousDate: "2026-03-02", requests: 1, cost: 7, previousRequests: 0, previousCost: 0 },
    ];

    const series = buildProjectedSpendSeries(trend, 20, { today: "2026-05-01" });

    assert.equal(series.complete, true);
    assert.equal(series.actualSpend, 12);
    assert.equal(series.projectedSpend, 12);
    assert.equal(series.vsCommitment, -8);
  });
});

describe("projectCycleUtilization", () => {
  it("extrapolates end-of-cycle use from elapsed pace", () => {
    assert.equal(projectCycleUtilization(25, 50), 50);
    assert.equal(projectCycleUtilization(40, 20), 200);
  });

  it("returns null while the cycle is still forming", () => {
    assert.equal(projectCycleUtilization(10, 3), null);
    assert.equal(projectCycleUtilization(null, 50), null);
  });
});

describe("buildCycleUsageNeedRows", () => {
  it("maps commitment share and projected use", () => {
    const rows = buildCycleUsageNeedRows([
      {
        id: "c1",
        toolName: "cursor",
        toolKey: "cursor",
        planNames: ["Pro"],
        planCount: 1,
        cycleSpend: 60,
        verifiedUsageCost: 100,
        estimatedApiCost: 0,
        modelCalls: 10,
        windowFrom: "2026-07-01",
        windowTo: "2026-07-31",
        spendSharePercent: 60,
        utilizationPercent: 40,
        utilizationDisplayPercent: 40,
        verdictCode: "HEALTHY",
        expectedEndAt: null,
        billingCycle: {
          cycleStart: "2026-07-01",
          cycleEnd: "2026-07-31",
          nextRenewalDate: "2026-08-01",
          elapsedPercent: 50,
          remainingDays: 15,
          totalDays: 30,
        },
        billingCadence: "monthly",
        usageWindow: null,
        projectionState: "reliable",
      },
      {
        id: "c2",
        toolName: "claude",
        toolKey: "claude",
        planNames: ["Pro"],
        planCount: 1,
        cycleSpend: 40,
        verifiedUsageCost: 20,
        estimatedApiCost: 5,
        modelCalls: 4,
        windowFrom: "2026-07-01",
        windowTo: "2026-07-31",
        spendSharePercent: 40,
        utilizationPercent: 10,
        utilizationDisplayPercent: 10,
        verdictCode: "LIGHT_USE",
        expectedEndAt: null,
        billingCycle: {
          cycleStart: "2026-07-01",
          cycleEnd: "2026-07-31",
          nextRenewalDate: "2026-08-01",
          elapsedPercent: 50,
          remainingDays: 15,
          totalDays: 30,
        },
        billingCadence: "monthly",
        usageWindow: null,
        projectionState: "reliable",
      },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.commitmentSharePercent, 60);
    assert.equal(rows[0]?.projectedPercent, 80);
    assert.equal(rows[1]?.usageCost, 25);
    assert.equal(rows[1]?.needSoFarPercent, 50);
  });
});

describe("buildCycleCoverageRunways", () => {
  it("uses Current cycles verdict/expectedEndAt — not used÷elapsed inventing run-out", () => {
    const chart = buildCycleCoverageRunways(
      [
        {
          id: "c1",
          toolName: "cursor",
          toolKey: "cursor",
          planNames: ["Pro"],
          planCount: 1,
          cycleSpend: 60,
          verifiedUsageCost: 100,
          estimatedApiCost: 0,
          modelCalls: 10,
          windowFrom: "2026-07-01",
          windowTo: "2026-07-31",
          spendSharePercent: 60,
          utilizationPercent: 40,
          utilizationDisplayPercent: 40,
          verdictCode: "HEALTHY",
          expectedEndAt: null,
          billingCycle: {
            cycleStart: "2026-07-01",
            cycleEnd: "2026-07-31",
            nextRenewalDate: "2026-08-01",
            elapsedPercent: 50,
            remainingDays: 15,
            totalDays: 30,
          },
          billingCadence: "monthly",
          usageWindow: null,
          projectionState: "reliable",
        },
        {
          id: "c2",
          toolName: "chatgpt",
          toolKey: "chatgpt",
          planNames: ["Plus"],
          planCount: 1,
          cycleSpend: 20,
          verifiedUsageCost: 10,
          estimatedApiCost: 0,
          modelCalls: 4,
          windowFrom: "2026-07-10",
          windowTo: "2026-08-09",
          spendSharePercent: 20,
          utilizationPercent: 85,
          utilizationDisplayPercent: 85,
          verdictCode: "NEAR_LIMIT",
          expectedEndAt: "2026-07-28T12:00:00.000Z",
          billingCycle: {
            cycleStart: "2026-07-10",
            cycleEnd: "2026-08-09",
            nextRenewalDate: "2026-08-10",
            elapsedPercent: 5,
            remainingDays: 28,
            totalDays: 30,
          },
          billingCadence: "monthly",
          usageWindow: null,
          projectionState: "reliable",
        },
        {
          id: "c3",
          toolName: "claude",
          toolKey: "claude",
          planNames: ["Pro"],
          planCount: 1,
          cycleSpend: 40,
          verifiedUsageCost: 20,
          estimatedApiCost: 5,
          modelCalls: 4,
          windowFrom: "2026-07-01",
          windowTo: "2026-07-31",
          spendSharePercent: 40,
          utilizationPercent: null,
          utilizationDisplayPercent: null,
          verdictCode: null,
          expectedEndAt: null,
          billingCycle: {
            cycleStart: "2026-07-01",
            cycleEnd: "2026-07-31",
            nextRenewalDate: "2026-08-01",
            elapsedPercent: 50,
            remainingDays: 15,
            totalDays: 30,
          },
          billingCadence: "monthly",
          usageWindow: null,
          projectionState: "unavailable",
        },
      ],
      { today: "2026-07-12" },
    );

    assert.equal(chart.rows.length, 2);

    const cursor = chart.rows.find((row) => row.toolKey === "cursor");
    assert.ok(cursor);
    assert.equal(cursor.cycleStart, "2026-07-01");
    assert.equal(cursor.cycleEnd, "2026-07-31");
    assert.equal(cursor.coversFullCycle, true);
    assert.equal(cursor.coverageState, "covers_full");
    assert.equal(cursor.coversThroughDate, "2026-07-31");
    assert.equal(cursor.projectedPercent, null);

    const chatgpt = chart.rows.find((row) => row.toolKey === "chatgpt");
    assert.ok(chatgpt);
    assert.equal(chatgpt.cycleStart, "2026-07-10");
    assert.equal(chatgpt.cycleEnd, "2026-08-09");
    assert.equal(chatgpt.coversFullCycle, false);
    assert.equal(chatgpt.coverageState, "runs_out");
    assert.equal(chatgpt.coversThroughDate, "2026-07-28");
    assert.equal(chatgpt.projectedPercent, null);

    assert.equal(chart.coversFullCount, 1);
    assert.equal(chart.earliestRunOutDate, "2026-07-28");
    assert.equal(chart.calendar.rangeStartMs, Date.parse("2026-07-01T00:00:00.000Z"));
    assert.equal(chart.calendar.rangeEndMs, Date.parse("2026-08-09T00:00:00.000Z"));
    assert.ok(chart.calendar.tickDates.length >= 2);
  });

  it("does not invent run-out when NEAR_LIMIT has no expectedEndAt", () => {
    const chart = buildCycleCoverageRunways([
      {
        id: "c2",
        toolName: "chatgpt",
        toolKey: "chatgpt",
        planNames: ["Plus"],
        planCount: 1,
        cycleSpend: 20,
        verifiedUsageCost: 10,
        estimatedApiCost: 0,
        modelCalls: 4,
        windowFrom: "2026-07-10",
        windowTo: "2026-08-09",
        spendSharePercent: 20,
        utilizationPercent: 60,
        utilizationDisplayPercent: 60,
        verdictCode: "NEAR_LIMIT",
        expectedEndAt: null,
        billingCycle: {
          cycleStart: "2026-07-10",
          cycleEnd: "2026-08-09",
          nextRenewalDate: "2026-08-10",
          elapsedPercent: 20,
          remainingDays: 24,
          totalDays: 30,
        },
        billingCadence: "monthly",
        usageWindow: null,
        projectionState: "reliable",
      },
    ]);

    assert.equal(chart.rows[0]?.coverageState, "covers_full");
    assert.equal(chart.rows[0]?.coversThroughDate, "2026-08-09");
    assert.equal(chart.earliestRunOutDate, null);
  });
});

describe("dateAtCycleProgress", () => {
  it("maps progress onto the cycle calendar", () => {
    assert.equal(dateAtCycleProgress("2026-07-01", "2026-07-31", 30, 0), "2026-07-01");
    assert.equal(dateAtCycleProgress("2026-07-01", "2026-07-31", 30, 100), "2026-07-31");
    assert.equal(dateAtCycleProgress("2026-07-01", "2026-07-31", 30, 50), "2026-07-16");
  });
});
