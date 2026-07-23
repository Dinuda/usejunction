import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { usageDateKeysForLocalDates } from "@/lib/reports/daily-report";

describe("daily report local date keys", () => {
  test("maps calendar dates to UTC midnight keys without adjacent-day spillover", () => {
    const keys = usageDateKeysForLocalDates(["2026-07-23"]);
    assert.equal(keys.length, 1);
    assert.equal(keys[0]!.toISOString(), "2026-07-23T00:00:00.000Z");
  });

  test("dedupes repeated local dates", () => {
    const keys = usageDateKeysForLocalDates(["2026-07-22", "2026-07-22", "2026-07-23"]);
    assert.deepEqual(
      keys.map((d) => d.toISOString().slice(0, 10)),
      ["2026-07-22", "2026-07-23"],
    );
  });

  test("does not invent yesterday when only today is requested", () => {
    // Regression: spillover used to include window.from (prior UTC day) and
    // reattribute Wednesday as "today" when Thursday's key was empty.
    const keys = usageDateKeysForLocalDates(["2026-07-23"]);
    assert.equal(keys.some((d) => d.toISOString().startsWith("2026-07-22")), false);
  });
});
