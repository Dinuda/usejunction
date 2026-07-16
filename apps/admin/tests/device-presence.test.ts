import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_OFFLINE_AFTER_MS,
  deviceOfflineCutoff,
  isDeviceOnline,
} from "../lib/devices/presence";

const now = new Date("2026-07-16T12:00:00.000Z");

test("device presence uses one 30-minute offline threshold", () => {
  assert.equal(DEVICE_OFFLINE_AFTER_MS, 30 * 60_000);
  assert.equal(deviceOfflineCutoff(now).toISOString(), "2026-07-16T11:30:00.000Z");
  assert.equal(isDeviceOnline("2026-07-16T11:30:00.000Z", now), true);
  assert.equal(isDeviceOnline("2026-07-16T11:29:59.999Z", now), false);
});

test("device presence treats missing and invalid timestamps as offline", () => {
  assert.equal(isDeviceOnline(null, now), false);
  assert.equal(isDeviceOnline("not-a-date", now), false);
});
