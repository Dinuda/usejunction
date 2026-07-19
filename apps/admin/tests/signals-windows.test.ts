import assert from "node:assert/strict";
import { test } from "vitest";
import {
  InvalidSignalsWindowError,
  resolveSignalsWindows,
} from "../lib/signals/queries/windows";

const now = new Date("2026-07-16T18:30:00.000Z");

test.each([
  [1, "2026-07-16T00:00:00.000Z"],
  [7, "2026-07-10T00:00:00.000Z"],
  [14, "2026-07-03T00:00:00.000Z"],
  [30, "2026-06-17T00:00:00.000Z"],
])("Signals resolves an exact %i-day window including today", (days, expectedFrom) => {
  const windows = resolveSignalsWindows({ days }, now);
  assert.equal(windows.windowDays, days);
  assert.equal(windows.current.from.toISOString(), expectedFrom);
  assert.equal(windows.current.to.toISOString(), "2026-07-16T00:00:00.000Z");
  assert.equal(windows.prior.to.getTime() + 1, windows.current.from.getTime());
  assert.equal(windows.current.from.getTime() - windows.prior.from.getTime(), days * 86_400_000);
});

test("Signals defaults to 30 days and accepts the 366-day maximum", () => {
  assert.equal(resolveSignalsWindows({}, now).windowDays, 30);
  const maximum = resolveSignalsWindows(
    { days: 366 },
    new Date("2026-12-31T12:00:00.000Z"),
  );
  assert.equal(maximum.windowDays, 366);
  assert.equal(maximum.current.from.toISOString(), "2025-12-31T00:00:00.000Z");
});

test("Signals custom bounds are inclusive across leap and month boundaries", () => {
  const windows = resolveSignalsWindows({ from: "2024-02-28", to: "2024-03-01" }, now);
  assert.equal(windows.windowDays, 3);
  assert.equal(windows.current.from.toISOString(), "2024-02-28T00:00:00.000Z");
  assert.equal(windows.current.to.toISOString(), "2024-03-01T00:00:00.000Z");
  assert.equal(windows.prior.from.toISOString(), "2024-02-25T00:00:00.000Z");
  assert.equal(windows.prior.to.toISOString(), "2024-02-27T23:59:59.999Z");
});

test.each([
  [{ days: 0 }, /whole number/],
  [{ days: 367 }, /whole number/],
  [{ days: 7.5 }, /whole number/],
  [{ days: Number.NaN }, /whole number/],
  [{ from: "2026-07-01" }, /Both from and to/],
  [{ to: "2026-07-01" }, /Both from and to/],
  [{ from: "bad", to: "2026-07-01" }, /valid YYYY-MM-DD/],
  [{ from: "2026-07-02", to: "2026-07-01" }, /ascending order/],
  [{ days: 7, from: "2026-07-01", to: "2026-07-07" }, /either days or from\/to/],
  [{ from: "2025-01-01", to: "2026-01-02" }, /may not exceed 366/],
])("Signals rejects invalid window input %#", (input, message) => {
  assert.throws(
    () => resolveSignalsWindows(input, now),
    (error) => error instanceof InvalidSignalsWindowError && message.test(error.message),
  );
});
