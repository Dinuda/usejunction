import { prisma } from "@usejunction/db";
import { deviceOfflineCutoff } from "@/lib/devices/presence";

export async function readDeviceCoverage(orgId: string, now: Date = new Date()) {
  const offlineCutoff = deviceOfflineCutoff(now);
  const [devices, onlineDevices, offlineDevices] = await Promise.all([
    prisma.device.count({ where: { orgId } }),
    prisma.device.count({ where: { orgId, lastSeenAt: { gte: offlineCutoff } } }),
    prisma.device.findMany({
      where: { orgId, lastSeenAt: { lt: offlineCutoff } },
      orderBy: { lastSeenAt: "asc" },
      take: 3,
      select: { id: true, hostname: true, lastSeenAt: true, user: { select: { name: true } } },
    }),
  ]);
  return { devices, onlineDevices, offlineDevices };
}
