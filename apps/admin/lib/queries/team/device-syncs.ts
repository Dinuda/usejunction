import { prisma } from "@usejunction/db";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { isRepairRequired } from "@/lib/devices/health";
import { isDeviceActivelyReporting } from "@/lib/devices/presence";

export type DeviceSyncStatus = "online" | "stale" | "repair_required" | "never_synced";

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
  remoteSyncProtocol: number;
  status: DeviceSyncStatus;
  latestRequest: {
    id: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
  } | null;
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
    repairRequired: number;
  };
};

function classifyDeviceSync(input: {
  lastSeenAt: Date;
  lastUsageSyncAt: Date | null;
  now: Date;
}): DeviceSyncStatus {
  if (isRepairRequired(input.lastSeenAt, input.now)) return "repair_required";
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
      remoteSyncProtocol: true,
      syncRequestTargets: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          createdAt: true,
          completedAt: true,
          syncRequest: { select: { id: true } },
        },
      },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const rows: OrgDeviceSyncRow[] = devices.map((device) => {
    const latestRequest = device.syncRequestTargets?.[0] ?? null;
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
      remoteSyncProtocol: device.remoteSyncProtocol ?? 0,
      status,
      latestRequest: latestRequest
        ? {
            id: latestRequest.syncRequest.id,
            status: latestRequest.status,
            createdAt: latestRequest.createdAt.toISOString(),
            completedAt: latestRequest.completedAt?.toISOString() ?? null,
          }
        : null,
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
      repairRequired: rows.filter((row) => row.status === "repair_required").length,
    },
  };
}
