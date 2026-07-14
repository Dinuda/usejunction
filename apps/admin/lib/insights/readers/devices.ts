import { prisma } from "@usejunction/db";

export async function readDeviceCoverage(orgId: string, now: Date = new Date()) {
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);
  const [devices, onlineDevices, offlineDevices] = await Promise.all([
    prisma.device.count({ where: { orgId } }),
    prisma.device.count({ where: { orgId, lastSeenAt: { gte: fiveMinutesAgo } } }),
    prisma.device.findMany({
      where: { orgId, lastSeenAt: { lt: fiveMinutesAgo } },
      orderBy: { lastSeenAt: "asc" },
      take: 3,
      select: { id: true, hostname: true, lastSeenAt: true, user: { select: { name: true } } },
    }),
  ]);
  return { devices, onlineDevices, offlineDevices };
}
