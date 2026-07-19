import type { Prisma } from "@usejunction/db";

/** Devices that still count toward coverage and appear in fleet lists. */
export const activeDeviceWhere: Prisma.DeviceWhereInput = {
  decommissionedAt: null,
};

export function activeDevicesForOrg(orgId: string): Prisma.DeviceWhereInput {
  return { orgId, ...activeDeviceWhere };
}

/** Mark devices for uninstall on next heartbeat; they drop out of coverage immediately. */
export async function decommissionDevices(
  tx: Prisma.TransactionClient,
  deviceIds: string[],
  at: Date = new Date(),
) {
  if (deviceIds.length === 0) return;
  await tx.device.updateMany({
    where: { id: { in: deviceIds }, decommissionedAt: null },
    data: {
      decommissionedAt: at,
      localEndpoint: null,
      localSyncTokenHash: null,
      localSyncTokenEnc: null,
    },
  });
}

/** Revoke auth after the uninstall directive has been delivered (or cannot be). */
export async function revokeDeviceAuth(tx: Prisma.TransactionClient, deviceId: string) {
  await tx.device.update({
    where: { id: deviceId },
    data: {
      deviceToken: `revoked:${deviceId}`,
      deviceTokenHash: null,
      localEndpoint: null,
      localSyncTokenHash: null,
      localSyncTokenEnc: null,
    },
  });
}
