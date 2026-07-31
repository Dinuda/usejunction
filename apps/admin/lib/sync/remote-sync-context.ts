import { prisma } from "@usejunction/db";
import { getWorkspaceSyncReadiness } from "@/lib/analytics/snapshots/readiness";
import { activeDeviceWhere } from "@/lib/devices/decommission";
import { deviceHealthState, type DeviceHealthState } from "@/lib/devices/health";
import { REMOTE_SYNC_PROTOCOL } from "@/lib/sync/protocol";

export type SyncRequestScope = "team" | "you";

export type RemoteSyncPanelContext = {
  scope: SyncRequestScope;
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  hasLocalEndpoint: boolean;
  needsPlanSync: boolean;
  deviceCount: number;
  remoteCapableDeviceCount: number;
  dashboardReady: boolean;
  dirtyDayCount: number;
  snapshotLagSeconds: number | null;
  staleDeviceCount?: number;
  recoveryDevices?: DeviceRecoverySummary[];
};

export type DeviceRecoverySummary = {
  id: string;
  hostname: string;
  os: string;
  architecture: string;
  lastSeenAt: string;
  state: DeviceHealthState;
  remoteSyncProtocol: number;
  owner: { id: string; name: string; email: string };
  isCurrentUser: boolean;
};

export async function resolveLinkedDeveloper(orgId: string, userId: string) {
  return prisma.developer.findFirst({
    where: { orgId, authUserId: userId, removedAt: null },
    select: { id: true },
  });
}

export async function getRemoteSyncPanelContext(
  orgId: string,
  authUserId: string,
  scope: SyncRequestScope,
): Promise<RemoteSyncPanelContext | null> {
  const developer = scope === "you" ? await resolveLinkedDeveloper(orgId, authUserId) : null;
  if (scope === "you" && !developer) return null;
  const [devices, readiness] = await Promise.all([
    prisma.device.findMany({
      where: {
        orgId,
        ...activeDeviceWhere,
        ...(scope === "you" ? { userId: developer!.id } : {}),
      },
      select: {
        id: true,
        hostname: true,
        os: true,
        architecture: true,
        lastSeenAt: true,
        lastUsageSyncAt: true,
        lastAccountSyncAt: true,
        localEndpoint: true,
        remoteSyncProtocol: true,
        user: { select: { id: true, name: true, email: true, authUserId: true } },
      },
    }),
    getWorkspaceSyncReadiness(orgId),
  ]);
  if (devices.length === 0) return null;

  let lastSeenAt: Date | null = null;
  let lastUsageSyncAt: Date | null = null;
  let lastAccountSyncAt: Date | null = null;
  for (const device of devices) {
    if (!lastSeenAt || device.lastSeenAt > lastSeenAt) lastSeenAt = device.lastSeenAt;
    if (device.lastUsageSyncAt && (!lastUsageSyncAt || device.lastUsageSyncAt > lastUsageSyncAt)) {
      lastUsageSyncAt = device.lastUsageSyncAt;
    }
    if (device.lastAccountSyncAt && (!lastAccountSyncAt || device.lastAccountSyncAt > lastAccountSyncAt)) {
      lastAccountSyncAt = device.lastAccountSyncAt;
    }
  }

  const recoveryDevices = devices
    .map((device) => ({
      id: device.id,
      hostname: device.hostname,
      os: device.os,
      architecture: device.architecture,
      lastSeenAt: device.lastSeenAt.toISOString(),
      state: deviceHealthState(device.lastSeenAt),
      remoteSyncProtocol: device.remoteSyncProtocol,
      owner: { id: device.user.id, name: device.user.name, email: device.user.email },
      isCurrentUser: device.user.authUserId === authUserId,
    }))
    .filter((device) => device.state === "repair_required");

  return {
    scope,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    lastUsageSyncAt: lastUsageSyncAt?.toISOString() ?? null,
    lastAccountSyncAt: lastAccountSyncAt?.toISOString() ?? null,
    hasLocalEndpoint: devices.some((device) => Boolean(device.localEndpoint)),
    needsPlanSync: false,
    deviceCount: devices.length,
    remoteCapableDeviceCount: devices.filter((device) => device.remoteSyncProtocol >= REMOTE_SYNC_PROTOCOL).length,
    dashboardReady: readiness.dashboardReady,
    dirtyDayCount: readiness.dirtyDayCount,
    snapshotLagSeconds: readiness.snapshotLagSeconds,
    staleDeviceCount: devices.filter((device) => deviceHealthState(device.lastSeenAt) !== "online").length,
    recoveryDevices,
  };
}
