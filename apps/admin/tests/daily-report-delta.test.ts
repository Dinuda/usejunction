import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { priorDayDeltaPct } from "@/lib/reports/daily-report";

describe("priorDayDeltaPct", () => {
  test("reports positive % when today exceeds yesterday baseline", () => {
    const delta = priorDayDeltaPct(286.6e6, 455.8e6);
    assert.ok(delta != null);
    assert.equal(delta.toFixed(0), "59");
  });

  test("reports negative % when today is below yesterday baseline", () => {
    assert.equal(priorDayDeltaPct(80, 50), -37.5);
  });

  test("returns +100% when prior is zero and current is positive", () => {
    assert.equal(priorDayDeltaPct(0, 50), 100);
  });

  test("returns null when both prior and current are zero", () => {
    assert.equal(priorDayDeltaPct(0, 0), null);
  });
});
