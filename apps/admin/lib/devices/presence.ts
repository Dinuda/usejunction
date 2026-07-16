export const DEVICE_OFFLINE_AFTER_MS = 30 * 60_000;

export function deviceOfflineCutoff(now: Date = new Date()) {
  return new Date(now.getTime() - DEVICE_OFFLINE_AFTER_MS);
}

export function isDeviceOnline(
  lastSeenAt: Date | string | null | undefined,
  now: Date | number = Date.now(),
) {
  if (!lastSeenAt) return false;
  const lastSeenMs = lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(lastSeenAt);
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Number.isFinite(lastSeenMs) && lastSeenMs >= nowMs - DEVICE_OFFLINE_AFTER_MS;
}
