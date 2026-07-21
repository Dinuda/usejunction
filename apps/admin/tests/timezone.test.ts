import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  addLocalDays,
  isDueForDailyReport,
  isDueForWeeklyOrgReport,
  isValidIanaTimeZone,
  localDateString,
  localDayUtcWindow,
  localHour,
  localWeekday,
  weekRangeEndingOnOrBefore,
  weekdayOfLocalDate,
  zonedLocalToUtc,
} from "@/lib/timezone";

describe("timezone helpers", () => {
  test("validates IANA names", () => {
    assert.equal(isValidIanaTimeZone("Asia/Colombo"), true);
    assert.equal(isValidIanaTimeZone("UTC"), true);
    assert.equal(isValidIanaTimeZone("Not/AZone"), false);
    assert.equal(isValidIanaTimeZone(""), false);
  });

  test("formats local date and hour in Colombo", () => {
    // 2026-07-21 13:30 UTC = 19:00 in Asia/Colombo (UTC+5:30)
    const now = new Date("2026-07-21T13:30:00.000Z");
    assert.equal(localDateString(now, "Asia/Colombo"), "2026-07-21");
    assert.equal(localHour(now, "Asia/Colombo"), 19);
    assert.equal(isDueForDailyReport(now, "Asia/Colombo"), true);
    assert.equal(isDueForDailyReport(now, "UTC"), false);
  });

  test("weekly org report is due only on Sunday 19:00 local", () => {
    // 2026-07-19 is Sunday; 13:30 UTC = 19:00 Asia/Colombo
    const sunday = new Date("2026-07-19T13:30:00.000Z");
    assert.equal(localWeekday(sunday, "Asia/Colombo"), 0);
    assert.equal(isDueForWeeklyOrgReport(sunday, "Asia/Colombo"), true);
    // Tuesday 19:00 Colombo — daily yes, weekly no
    const tuesday = new Date("2026-07-21T13:30:00.000Z");
    assert.equal(localWeekday(tuesday, "Asia/Colombo"), 2);
    assert.equal(isDueForDailyReport(tuesday, "Asia/Colombo"), true);
    assert.equal(isDueForWeeklyOrgReport(tuesday, "Asia/Colombo"), false);
  });

  test("weekRangeEndingOnOrBefore is Mon–Sun ending on Sunday", () => {
    assert.equal(weekdayOfLocalDate("2026-07-26"), 0);
    assert.deepEqual(weekRangeEndingOnOrBefore("2026-07-26"), {
      start: "2026-07-20",
      end: "2026-07-26",
    });
    // Wednesday lands in the prior completed Sunday week
    assert.deepEqual(weekRangeEndingOnOrBefore("2026-07-22"), {
      start: "2026-07-13",
      end: "2026-07-19",
    });
  });

  test("converts local midnight to UTC for Colombo", () => {
    const midnight = zonedLocalToUtc("2026-07-21", 0, 0, "Asia/Colombo");
    assert.equal(midnight.toISOString(), "2026-07-20T18:30:00.000Z");
  });

  test("builds local day UTC window through now", () => {
    const now = new Date("2026-07-21T13:30:00.000Z");
    const window = localDayUtcWindow({
      localDate: "2026-07-21",
      timeZone: "Asia/Colombo",
      now,
      throughNow: true,
    });
    assert.equal(window.from.toISOString(), "2026-07-20T18:30:00.000Z");
    assert.equal(window.to.toISOString(), now.toISOString());
  });

  test("addLocalDays", () => {
    assert.equal(addLocalDays("2026-07-21", -1), "2026-07-20");
  });
});
