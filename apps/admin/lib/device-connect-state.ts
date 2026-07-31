export type DeviceConnectSnapshot = {
  id: string;
  hostname: string;
  os: string;
  createdAt?: string;
  lastSeenAt: string;
  lastToolsSyncAt?: string | null;
  lastUsageSyncAt?: string | null;
  toolInstallations?: Array<{ toolName: string; version?: string | null }>;
};

export type DeviceConnectStage =
  | "command_ready"
  | "enrolled"
  | "syncing"
  | "ready"
  | "stalled";

export function hasToolsSyncReady(device: DeviceConnectSnapshot | null | undefined): boolean {
  return Boolean(device?.lastToolsSyncAt);
}

/** Device is ready once both first inventory and usage syncs have reached the server. */
export function isReadyDevice(device: DeviceConnectSnapshot | null | undefined): boolean {
  return Boolean(device && hasToolsSyncReady(device) && hasUsageReady(device));
}

export function hasUsageReady(device: DeviceConnectSnapshot | null | undefined): boolean {
  return Boolean(device?.lastUsageSyncAt);
}

export function getDeviceConnectStage(
  device: DeviceConnectSnapshot | null | undefined,
  options?: { stalled?: boolean },
): DeviceConnectStage {
  if (!device) return "command_ready";
  if (isReadyDevice(device)) return "ready";
  if (options?.stalled) return "stalled";
  return hasToolsSyncReady(device) ? "syncing" : "enrolled";
}

export function isEnrollmentTokenStale(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function shouldServeCachedEnrollmentToken(input: {
  token: string | null;
  controlPlaneUrl: string;
  expiresAt: string | null;
  enrollmentConsumed: boolean;
}): boolean {
  if (input.enrollmentConsumed) return false;
  if (!input.token || !input.controlPlaneUrl) return false;
  return !isEnrollmentTokenStale(input.expiresAt);
}

/** Enrolled device still waiting on tools, usage, or dashboard prep. */
export function shouldEnterSyncWait(device: DeviceConnectSnapshot | null | undefined): boolean {
  if (!device) return false;
  return !isReadyDevice(device) || !hasUsageReady(device);
}
