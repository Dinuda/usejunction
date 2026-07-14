import assert from "node:assert/strict";
import test from "node:test";
import {
  inclusiveDayCount,
  usageDayFilter,
  usageInclusiveEnd,
  usageWindowDays,
  utcDateOnly,
} from "../lib/metrics/date-range";

test("usageWindowDays includes today as the final day", () => {
  const now = new Date("2026-07-14T18:30:00.000Z");
  const window = usageWindowDays(7, now);
  assert.equal(window.to.toISOString(), "2026-07-14T00:00:00.000Z");
  assert.equal(window.from.toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(inclusiveDayCount(window.from, window.to), 7);
});

test("usageDayFilter includes rows dated today when to is now", () => {
  const now = new Date("2026-07-14T18:30:00.000Z");
  const filter = usageDayFilter(new Date("2026-07-08T00:00:00.000Z"), now);
  assert.equal(filter.gte.toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(filter.lt.toISOString(), "2026-07-15T00:00:00.000Z");
  assert.ok(usageInclusiveEnd(now) < filter.lt);
});

test("usageWindowDays previous period ends the day before current window starts", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const window = usageWindowDays(30, now);
  assert.equal(window.previousTo.toISOString(), "2026-06-14T00:00:00.000Z");
  assert.equal(window.previousFrom.toISOString(), "2026-05-16T00:00:00.000Z");
});

test("utcDateOnly normalizes timestamps to UTC midnight", () => {
  assert.equal(utcDateOnly(new Date("2026-07-14T23:59:59.000Z")).toISOString(), "2026-07-14T00:00:00.000Z");
});
