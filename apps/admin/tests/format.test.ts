import assert from "node:assert/strict";
import { test } from "vitest";
import {
  formatCompactNumber,
  formatDateTime,
  formatMicrosAsCurrency,
  formatRelativeTime,
  formatShortDate,
  formatUsd,
} from "../lib/format";

test("formatCompactNumber uses one-decimal compact notation", () => {
  assert.equal(formatCompactNumber(999), "999");
  assert.equal(formatCompactNumber(1_250), "1.3K");
  assert.equal(formatCompactNumber(20_300_000), "20.3M");
});

test("currency formatters distinguish dollars from micros", () => {
  assert.equal(formatUsd(0.5), "$0.50");
  assert.equal(formatUsd(0.1234), "$0.123");
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(-0.125), "-$0.125");
  assert.equal(formatMicrosAsCurrency("1234567"), "$1.23");
  assert.equal(formatMicrosAsCurrency(BigInt(2_500_000), "EUR"), "€2.50");
});

test("absolute date formatters use the shared short and date-time styles", () => {
  const value = new Date(2026, 6, 12, 14, 5);
  assert.equal(formatShortDate(value), "Jul 12");
  assert.equal(formatShortDate("2026-07-12"), "Jul 12");
  assert.equal(formatDateTime(value), "Jul 12, 2026, 2:05 PM");
  assert.equal(formatShortDate("not-a-date"), "unknown");
  assert.equal(formatDateTime("not-a-date"), "unknown");
});

test("formatRelativeTime handles missing, invalid, future, and every threshold", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  const ago = (milliseconds: number) => new Date(now.getTime() - milliseconds);

  assert.equal(formatRelativeTime(null, now), "never");
  assert.equal(formatRelativeTime(undefined, now), "never");
  assert.equal(formatRelativeTime("", now), "never");
  assert.equal(formatRelativeTime("not-a-date", now), "unknown");
  assert.equal(formatRelativeTime(new Date(now.getTime() + 60_000), now), "just now");
  assert.equal(formatRelativeTime(ago(59_999), now), "just now");
  assert.equal(formatRelativeTime(ago(60_000), now), "1m ago");
  assert.equal(formatRelativeTime(ago(59 * 60_000), now), "59m ago");
  assert.equal(formatRelativeTime(ago(60 * 60_000), now), "1h ago");
  assert.equal(formatRelativeTime(ago(23 * 60 * 60_000), now), "23h ago");
  assert.equal(formatRelativeTime(ago(24 * 60 * 60_000), now), "1d ago");
  assert.equal(formatRelativeTime(ago(6 * 24 * 60 * 60_000), now), "6d ago");
  const sevenDaysAgo = ago(7 * 24 * 60 * 60_000);
  assert.equal(formatRelativeTime(sevenDaysAgo, now), formatShortDate(sevenDaysAgo));
});
