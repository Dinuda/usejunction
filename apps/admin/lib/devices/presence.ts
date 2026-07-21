/**
 * Agent daemon heartbeats every 15 minutes (`agent/cmd/report.go`).
 * Treat a device as actively reporting if lastSeenAt is within 3 intervals
 * so a single missed beat does not flip it offline.
 */
export const DEVICE_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
export const DEVICE_ACTIVE_WITHIN_MS = 3 * DEVICE_HEARTBEAT_INTERVAL_MS;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True when the device has sent a heartbeat recently enough to count as active. */
export function isDeviceActivelyReporting(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
  withinMs: number = DEVICE_ACTIVE_WITHIN_MS,
): boolean {
  const seen = toDate(lastSeenAt);
  if (!seen) return false;
  return now.getTime() - seen.getTime() <= withinMs;
}

export function countActiveDevices(
  devices: Array<{ lastSeenAt?: Date | string | null }>,
  now: Date = new Date(),
  withinMs: number = DEVICE_ACTIVE_WITHIN_MS,
): { active: number; total: number } {
  const total = devices.length;
  const active = devices.filter((device) => isDeviceActivelyReporting(device.lastSeenAt, now, withinMs)).length;
  return { active, total };
}
