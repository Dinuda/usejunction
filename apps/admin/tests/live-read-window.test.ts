import assert from "node:assert/strict";
import { test } from "vitest";
import {
  LIVE_READ_HORIZON_DAYS,
  eachIsoDayInclusive,
  splitLiveReadWindow,
  windowUsesLiveReads,
} from "@/lib/analytics/snapshots/overlay";

test("windowUsesLiveReads is true for recent short windows", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-06-24T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  assert.equal(windowUsesLiveReads(from, to, now), true);
  assert.equal(LIVE_READ_HORIZON_DAYS, 35);
});

test("splitLiveReadWindow isolates history older than the live horizon", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-04-01T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  const split = splitLiveReadWindow(from, to, now);
  assert.ok(split.historyFrom);
  assert.ok(split.historyTo);
  assert.ok(split.liveFrom);
  assert.ok(split.liveTo);
  assert.equal(split.liveFrom!.toISOString().slice(0, 10), "2026-06-18");
  assert.equal(split.historyTo!.toISOString().slice(0, 10), "2026-06-17");
  assert.equal(eachIsoDayInclusive(split.liveFrom!, split.liveTo!).length, LIVE_READ_HORIZON_DAYS + 1);
});

test("splitLiveReadWindow is live-only when fully inside horizon", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  const from = new Date("2026-07-01T00:00:00.000Z");
  const to = new Date("2026-07-23T00:00:00.000Z");
  const split = splitLiveReadWindow(from, to, now);
  assert.equal(split.historyFrom, null);
  assert.equal(split.historyTo, null);
  assert.ok(split.liveFrom);
  assert.ok(split.liveTo);
});
