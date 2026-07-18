import { prisma } from "@usejunction/db";
import { activeDevicesForOrg } from "@/lib/devices/decommission";
import { deviceOfflineCutoff } from "@/lib/devices/presence";

export async function readDeviceCoverage(orgId: string, now: Date = new Date()) {
  const offlineCutoff = deviceOfflineCutoff(now);
  const active = activeDevicesForOrg(orgId);
  const [devices, onlineDevices, offlineDevices] = await Promise.all([
    prisma.device.count({ where: active }),
    prisma.device.count({ where: { ...active, lastSeenAt: { gte: offlineCutoff } } }),
    prisma.device.findMany({
      where: { ...active, lastSeenAt: { lt: offlineCutoff } },
      orderBy: { lastSeenAt: "asc" },
      take: 3,
      select: { id: true, hostname: true, lastSeenAt: true, user: { select: { name: true } } },
    }),
  ]);
  return { devices, onlineDevices, offlineDevices };
}
