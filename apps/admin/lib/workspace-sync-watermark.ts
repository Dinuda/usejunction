/** Advances only when page-model data changes, not for presence-only heartbeats. */
export function buildDataSyncWatermark(input: {
  deviceCount: number;
  toolCount: number;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  lastToolsSyncAt: string | null;
  lastQuotasSyncAt: string | null;
  dirtyDayCount?: number;
  dashboardReady?: boolean;
}): string {
  return [
    input.deviceCount,
    input.toolCount,
    input.lastUsageSyncAt ?? "",
    input.lastAccountSyncAt ?? "",
    input.lastToolsSyncAt ?? "",
    input.lastQuotasSyncAt ?? "",
    input.dirtyDayCount ?? 0,
    input.dashboardReady === false ? "0" : "1",
  ].join("|");
}

/** Advances for liveness/presence UI without expiring analytics page caches. */
export function buildPresenceSyncWatermark(input: {
  deviceCount: number;
  activeDeviceCount: number;
  lastSeenAt: string | null;
}): string {
  return [input.deviceCount, input.activeDeviceCount, input.lastSeenAt ?? ""].join("|");
}
