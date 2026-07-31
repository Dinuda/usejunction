import { DEVICE_ACTIVE_WITHIN_MS } from "@/lib/devices/presence";

/** Existing liveness window: three 15-minute heartbeats. */
export const DEVICE_STALE_AFTER_MS = DEVICE_ACTIVE_WITHIN_MS;
export const DEVICE_REPAIR_AFTER_MS = 48 * 60 * 60 * 1000;

export type DeviceHealthState = "online" | "auto_recovery" | "repair_required";

function dateValue(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function deviceHealthState(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
): DeviceHealthState {
  const seen = dateValue(lastSeenAt);
  if (seen == null) return "repair_required";
  const age = Math.max(0, now.getTime() - seen);
  if (age <= DEVICE_STALE_AFTER_MS) return "online";
  if (age < DEVICE_REPAIR_AFTER_MS) return "auto_recovery";
  return "repair_required";
}

export function isDeviceStale(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
) {
  return deviceHealthState(lastSeenAt, now) !== "online";
}

export function isRepairRequired(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
) {
  return deviceHealthState(lastSeenAt, now) === "repair_required";
}

export function outageKey(deviceId: string, lastSeenAt: Date | string) {
  const seen = lastSeenAt instanceof Date ? lastSeenAt.toISOString() : new Date(lastSeenAt).toISOString();
  return `device-health:${deviceId}:${seen}`;
}
