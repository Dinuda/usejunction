import assert from "node:assert/strict";
import { test } from "vitest";
import {
  DEFAULT_ROLLING_PERIOD,
  parseRollingPeriodFromSearch,
  periodsEqual,
  rollingPeriodHref,
  rollingPeriodLabel,
} from "../lib/dashboard/period-prefs";

test("parseRollingPeriodFromSearch defaults to 30 days", () => {
  assert.deepEqual(parseRollingPeriodFromSearch({}), DEFAULT_ROLLING_PERIOD);
});

test("parseRollingPeriodFromSearch accepts presets and custom bounds", () => {
  assert.deepEqual(parseRollingPeriodFromSearch({ days: "3" }), { kind: "preset", days: 3 });
  assert.deepEqual(parseRollingPeriodFromSearch({ days: "60" }), { kind: "preset", days: 60 });
  assert.deepEqual(parseRollingPeriodFromSearch({ from: "2026-05-01", to: "2026-06-15" }), {
    kind: "custom",
    id: "custom:2026-05-01:2026-06-15",
    from: "2026-05-01",
    to: "2026-06-15",
  });
});

test("parseRollingPeriodFromSearch rejects inverted custom ranges", () => {
  assert.deepEqual(parseRollingPeriodFromSearch({ from: "2026-06-15", to: "2026-05-01" }), DEFAULT_ROLLING_PERIOD);
});

test("rollingPeriodHref omits days for the 30-day default", () => {
  assert.equal(rollingPeriodHref(DEFAULT_ROLLING_PERIOD), "/dashboard?view=last_30_days");
  assert.equal(rollingPeriodHref({ kind: "preset", days: 90 }), "/dashboard?view=last_30_days&days=90");
  assert.equal(rollingPeriodHref({ kind: "preset", days: 3 }, "/team/developer-1"), "/team/developer-1?view=last_30_days&days=3");
  assert.equal(
    rollingPeriodHref({ kind: "custom", id: "x", from: "2026-05-01", to: "2026-06-01" }),
    "/dashboard?view=last_30_days&from=2026-05-01&to=2026-06-01",
  );
});

test("rollingPeriodLabel and equality helpers", () => {
  assert.equal(rollingPeriodLabel({ kind: "preset", days: 60 }), "Last 60 days");
  assert.equal(
    rollingPeriodLabel({ kind: "custom", id: "x", from: "2026-05-01", to: "2026-06-01" }),
    "May 1 – Jun 1",
  );
  assert.equal(
    periodsEqual({ kind: "preset", days: 30 }, { kind: "preset", days: 30 }),
    true,
  );
  assert.equal(
    periodsEqual(
      { kind: "custom", id: "a", from: "2026-05-01", to: "2026-06-01" },
      { kind: "custom", id: "b", from: "2026-05-01", to: "2026-06-01" },
    ),
    true,
  );
});
