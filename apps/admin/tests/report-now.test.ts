import { afterEach, describe, expect, it } from "vitest";
import { reportNow } from "@/lib/report-now";

describe("reportNow", () => {
  afterEach(() => {
    delete process.env.E2E_AS_OF;
  });

  it("returns the pinned instant when E2E_AS_OF is set", () => {
    process.env.E2E_AS_OF = "2026-07-16T12:00:00.000Z";
    expect(reportNow().toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("falls back to the real clock when E2E_AS_OF is unset", () => {
    const before = Date.now();
    const value = reportNow().getTime();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});
