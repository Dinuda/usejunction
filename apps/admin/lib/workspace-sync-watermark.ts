/**
 * Compact token that advances whenever agent ingest lands new device/tool/usage
 * facts, or when snapshot readiness changes. The workspace layout watches this
 * to invalidate stale page caches.
 */
export function buildSyncWatermark(input: {
  deviceCount: number;
  toolCount: number;
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  dirtyDayCount?: number;
  dashboardReady?: boolean;
}): string {
  return [
    input.deviceCount,
    input.toolCount,
    input.lastSeenAt ?? "",
    input.lastUsageSyncAt ?? "",
    input.lastAccountSyncAt ?? "",
    input.dirtyDayCount ?? 0,
    input.dashboardReady === false ? "0" : "1",
  ].join("|");
}
