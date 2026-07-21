import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEVICE_ACTIVE_WITHIN_MS,
  countActiveDevices,
  isDeviceActivelyReporting,
} from "@/lib/devices/presence";

describe("device presence (heartbeat)", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("treats a recent heartbeat as active", () => {
    const lastSeenAt = new Date(now.getTime() - 10 * 60 * 1000);
    assert.equal(isDeviceActivelyReporting(lastSeenAt, now), true);
  });

  it("treats a stale heartbeat as inactive", () => {
    const lastSeenAt = new Date(now.getTime() - DEVICE_ACTIVE_WITHIN_MS - 1);
    assert.equal(isDeviceActivelyReporting(lastSeenAt, now), false);
  });

  it("accepts ISO strings from JSON round-trips", () => {
    const lastSeenAt = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    assert.equal(isDeviceActivelyReporting(lastSeenAt, now), true);
  });

  it("counts active vs enrolled devices", () => {
    const devices = [
      { lastSeenAt: new Date(now.getTime() - 5 * 60 * 1000) },
      { lastSeenAt: new Date(now.getTime() - DEVICE_ACTIVE_WITHIN_MS - 60_000) },
      { lastSeenAt: null },
    ];
    assert.deepEqual(countActiveDevices(devices, now), { active: 1, total: 3 });
  });
});
