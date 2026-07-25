import { prisma } from "@usejunction/db";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { isDeviceActivelyReporting } from "@/lib/devices/presence";

export type DeviceSyncStatus = "online" | "stale" | "never_synced";

export type OrgDeviceSyncRow = {
  id: string;
  hostname: string;
  os: string;
  architecture: string;
  agentVersion: string;
  lastSeenAt: string;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  lastToolsSyncAt: string | null;
  lastQuotasSyncAt: string | null;
  hasLocalEndpoint: boolean;
  status: DeviceSyncStatus;
  developer: {
    id: string;
    name: string;
    email: string;
  };
};

export type OrgDeviceSyncStatus = {
  devices: OrgDeviceSyncRow[];
  totals: {
    total: number;
    online: number;
    stale: number;
    neverSynced: number;
  };
};

function classifyDeviceSync(input: {
  lastSeenAt: Date;
  lastUsageSyncAt: Date | null;
  now: Date;
}): DeviceSyncStatus {
  if (!input.lastUsageSyncAt) return "never_synced";
  if (isDeviceActivelyReporting(input.lastSeenAt, input.now)) return "online";
  return "stale";
}

/** Org-wide per-machine sync watermarks for the Team → Syncs tab. */
export async function getOrgDeviceSyncStatus(orgId: string, now: Date = new Date()): Promise<OrgDeviceSyncStatus> {
  const devices = await prisma.device.findMany({
    where: activeDevicesForOrg(orgId),
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      hostname: true,
      os: true,
      architecture: true,
      agentVersion: true,
      lastSeenAt: true,
      lastUsageSyncAt: true,
      lastAccountSyncAt: true,
      lastToolsSyncAt: true,
      lastQuotasSyncAt: true,
      localEndpoint: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const rows: OrgDeviceSyncRow[] = devices.map((device) => {
    const status = classifyDeviceSync({
      lastSeenAt: device.lastSeenAt,
      lastUsageSyncAt: device.lastUsageSyncAt,
      now,
    });
    return {
      id: device.id,
      hostname: device.hostname,
      os: device.os,
      architecture: device.architecture,
      agentVersion: device.agentVersion,
      lastSeenAt: device.lastSeenAt.toISOString(),
      lastUsageSyncAt: device.lastUsageSyncAt?.toISOString() ?? null,
      lastAccountSyncAt: device.lastAccountSyncAt?.toISOString() ?? null,
      lastToolsSyncAt: device.lastToolsSyncAt?.toISOString() ?? null,
      lastQuotasSyncAt: device.lastQuotasSyncAt?.toISOString() ?? null,
      hasLocalEndpoint: Boolean(device.localEndpoint),
      status,
      developer: {
        id: device.user.id,
        name: device.user.name,
        email: device.user.email,
      },
    };
  });

  return {
    devices: rows,
    totals: {
      total: rows.length,
      online: rows.filter((row) => row.status === "online").length,
      stale: rows.filter((row) => row.status === "stale").length,
      neverSynced: rows.filter((row) => row.status === "never_synced").length,
    },
  };
}
