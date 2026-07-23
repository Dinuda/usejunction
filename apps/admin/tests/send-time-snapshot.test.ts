import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { isReportDeltaComparable } from "@/lib/reports/send-time-snapshot";

describe("report send-time snapshots", () => {
  test("isReportDeltaComparable is false for today before 19:00 local", () => {
    const now = new Date("2026-07-23T12:04:00.000Z"); // 17:34 Asia/Colombo
    assert.equal(
      isReportDeltaComparable({ localDate: "2026-07-23", timeZone: "Asia/Colombo", now }),
      false,
    );
  });

  test("isReportDeltaComparable is true for today at/after 19:00 local", () => {
    const now = new Date("2026-07-23T14:30:00.000Z"); // 20:00 Asia/Colombo
    assert.equal(
      isReportDeltaComparable({ localDate: "2026-07-23", timeZone: "Asia/Colombo", now }),
      true,
    );
  });

  test("isReportDeltaComparable is true for historical dates", () => {
    const now = new Date("2026-07-23T12:04:00.000Z");
    assert.equal(
      isReportDeltaComparable({ localDate: "2026-07-22", timeZone: "Asia/Colombo", now }),
      true,
    );
  });
});
