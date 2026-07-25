export type DeviceConnectSnapshot = {
  id: string;
  hostname: string;
  os: string;
  lastSeenAt: string;
  lastUsageSyncAt?: string | null;
  toolInstallations?: Array<{ toolName: string; version?: string | null }>;
};

/** Device is ready once enrolled, tools reported, and first usage sync landed. */
export function isReadyDevice(device: DeviceConnectSnapshot | null | undefined): boolean {
  return Boolean(device && (device.toolInstallations?.length ?? 0) > 0);
}

export function hasUsageReady(device: DeviceConnectSnapshot | null | undefined): boolean {
  return Boolean(device?.lastUsageSyncAt);
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
