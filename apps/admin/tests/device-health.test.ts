import assert from "node:assert/strict";
import { test } from "vitest";
import {
  DEVICE_REPAIR_AFTER_MS,
  DEVICE_STALE_AFTER_MS,
  deviceHealthState,
  outageKey,
} from "@/lib/devices/health";

const now = new Date("2026-07-28T12:00:00.000Z");

test("keeps a device online at the 45-minute boundary", () => {
  assert.equal(
    deviceHealthState(new Date(now.getTime() - DEVICE_STALE_AFTER_MS), now),
    "online",
  );
  assert.equal(
    deviceHealthState(new Date(now.getTime() - DEVICE_STALE_AFTER_MS - 1), now),
    "auto_recovery",
  );
});

test("requires repair at exactly 48 hours", () => {
  assert.equal(
    deviceHealthState(new Date(now.getTime() - DEVICE_REPAIR_AFTER_MS + 1), now),
    "auto_recovery",
  );
  assert.equal(
    deviceHealthState(new Date(now.getTime() - DEVICE_REPAIR_AFTER_MS), now),
    "repair_required",
  );
});

test("keys an outage by the device and last-seen timestamp", () => {
  assert.equal(
    outageKey("device-1", new Date("2026-07-28T11:00:00.000Z")),
    "device-health:device-1:2026-07-28T11:00:00.000Z",
  );
});
