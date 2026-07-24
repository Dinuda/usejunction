import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  buildWowWeekStrip,
  displayWowDeltaPct,
  isoWeekdayOfLocalDate,
  pctDelta,
  weekRangeContaining,
  wowStripToSeries,
  type WowDayTotals,
} from "@/lib/reports/wow-week-strip";

function totals(tokens: number, cost = 0, requests = 0): WowDayTotals {
  return { tokens, cost, requests };
}

describe("wow week strip", () => {
  test("weekRangeContaining returns Mon–Sun for a Wednesday", () => {
    // 2026-07-22 is Wednesday
    assert.deepEqual(weekRangeContaining("2026-07-22"), {
      start: "2026-07-20",
      end: "2026-07-26",
    });
    assert.equal(isoWeekdayOfLocalDate("2026-07-20"), 0);
    assert.equal(isoWeekdayOfLocalDate("2026-07-22"), 2);
    assert.equal(isoWeekdayOfLocalDate("2026-07-26"), 6);
  });

  test("weekRangeContaining handles Sunday as week end", () => {
    assert.deepEqual(weekRangeContaining("2026-07-26"), {
      start: "2026-07-20",
      end: "2026-07-26",
    });
  });

  test("builds 7 cells with day-over-day outlier when prior day exists", () => {
    const weekStart = "2026-07-20";
    const weekEnd = "2026-07-26";
    const currentByDate = new Map<string, WowDayTotals>([
      ["2026-07-20", totals(10)],
      ["2026-07-21", totals(20)],
      ["2026-07-22", totals(100)],
    ]);
    const priorByDate = new Map<string, WowDayTotals>([
      ["2026-07-19", totals(8)],
      ["2026-07-20", totals(10)],
      ["2026-07-21", totals(20)],
    ]);

    const strip = buildWowWeekStrip({
      asOfLocalDate: "2026-07-22",
      timeZone: "Asia/Colombo",
      weekStart,
      weekEnd,
      currentByDate,
      priorByDate,
      topToolDisplayName: "Cursor",
      todayPartial: true,
    });

    assert.equal(strip.version, 1);
    assert.equal(strip.grain, "day");
    assert.equal(strip.cells.length, 7);
    assert.equal(strip.weekStart, weekStart);
    assert.equal(strip.priorWeekStart, "2026-07-19");
    assert.equal(strip.metricDefault, "tokens");

    const wed = strip.cells[2]!;
    assert.equal(wed.label, "Wed");
    assert.equal(wed.tokens, 100);
    assert.equal(wed.priorTokens, 20);
    assert.equal(wed.deltaPct, 400);
    assert.equal(wed.isOutlier, true);
    assert.equal(wed.isToday, true);
    assert.equal(wed.isPartial, true);

    const thu = strip.cells[3]!;
    assert.equal(thu.label, "Thu");
    assert.equal(thu.tokens, 0);
    assert.equal(thu.isPartial, true);
    assert.equal(thu.isToday, false);
    assert.equal(thu.deltaPct, null);

    assert.match(strip.insight.headline, /vs yesterday/);
    assert.match(strip.insight.headline, /Peak: Wed/);
    assert.match(strip.insight.headline, /mostly Cursor/);
    assert.equal(strip.insight.peakWeekday, 2);
    assert.equal(strip.availability, "partial");
  });

  test("does not mark outlier when prior is zero", () => {
    const strip = buildWowWeekStrip({
      asOfLocalDate: "2026-07-22",
      timeZone: "UTC",
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      currentByDate: new Map([["2026-07-22", totals(100)]]),
      priorByDate: new Map(),
    });
    const wed = strip.cells[2]!;
    assert.equal(wed.deltaPct, null);
    assert.equal(wed.isOutlier, false);
  });

  test("suppresses absurd day-over-day % when prior day was near-empty", () => {
    assert.equal(displayWowDeltaPct(50, 100_000), null);
    assert.equal(displayWowDeltaPct(100, 50), 100);
    assert.equal(pctDelta(100_000, 50), 199900);

    const strip = buildWowWeekStrip({
      asOfLocalDate: "2026-07-26",
      timeZone: "UTC",
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      currentByDate: new Map([
        ["2026-07-25", totals(80_000)],
        ["2026-07-26", totals(90_000)],
      ]),
      priorByDate: new Map([
        ["2026-07-24", totals(40)],
        ["2026-07-25", totals(30)],
      ]),
    });
    assert.equal(strip.cells[5]!.deltaPct, null);
    assert.equal(strip.cells[5]!.isOutlier, false);
    assert.equal(strip.cells[6]!.deltaPct, null);
    assert.equal(strip.cells[6]!.isOutlier, false);
  });

  test("pctDelta and series export", () => {
    assert.equal(pctDelta(0, 0), null);
    assert.equal(pctDelta(10, 0), 100);
    assert.equal(pctDelta(150, 100), 50);

    const strip = buildWowWeekStrip({
      asOfLocalDate: "2026-07-26",
      timeZone: "UTC",
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      currentByDate: new Map([
        ["2026-07-20", totals(1)],
        ["2026-07-21", totals(2)],
        ["2026-07-22", totals(3)],
        ["2026-07-23", totals(4)],
        ["2026-07-24", totals(5)],
        ["2026-07-25", totals(6)],
        ["2026-07-26", totals(7)],
      ]),
      priorByDate: new Map([
        ["2026-07-19", totals(1)],
        ["2026-07-20", totals(1)],
        ["2026-07-21", totals(2)],
        ["2026-07-22", totals(3)],
        ["2026-07-23", totals(4)],
        ["2026-07-24", totals(5)],
        ["2026-07-25", totals(6)],
      ]),
    });
    assert.equal(strip.availability, "complete");
    const series = wowStripToSeries(strip);
    assert.equal(series.length, 7);
    assert.equal(series[0]?.label, "Mon");
    assert.equal(series[6]?.tokens, 7);
  });

  test("uses send-time override for today's prior baseline", () => {
    const strip = buildWowWeekStrip({
      asOfLocalDate: "2026-07-22",
      timeZone: "UTC",
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      currentByDate: new Map([["2026-07-22", totals(50)]]),
      priorByDate: new Map([["2026-07-21", totals(200)]]),
      todayPriorOverride: totals(80),
    });
    const wed = strip.cells[2]!;
    assert.equal(wed.priorTokens, 80);
    assert.equal(wed.deltaPct, -37.5);
  });
});
