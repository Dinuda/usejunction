/**
 * Compact token that advances whenever agent ingest lands new device/tool/usage
 * facts. The workspace layout watches this to invalidate stale page caches.
 */
export function buildSyncWatermark(input: {
  deviceCount: number;
  toolCount: number;
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
}): string {
  return [
    input.deviceCount,
    input.toolCount,
    input.lastSeenAt ?? "",
    input.lastUsageSyncAt ?? "",
    input.lastAccountSyncAt ?? "",
  ].join("|");
}
