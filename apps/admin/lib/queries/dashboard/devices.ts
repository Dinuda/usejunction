import { prisma } from "@usejunction/db";

export interface DashboardDeviceRow {
  id: string;
  hostname: string;
  os: string;
  architecture: string;
  agentVersion: string;
  status: string;
  lastSeenAt: Date;
  createdAt: Date;
  user: { name: string; email: string } | null;
  toolInstallations: Array<{ toolName: string; detected: boolean; configured: boolean }>;
  quotaSnapshots: Array<{
    toolName: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
    windowType: string;
    updatedAt: Date;
  }>;
  totalRequests: number;
}

export interface DashboardDevicesData {
  devices: DashboardDeviceRow[];
}

export async function getDashboardDevices(orgId: string): Promise<DashboardDevicesData> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [devices, requestCounts] = await Promise.all([
    prisma.device.findMany({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        toolInstallations: { select: { toolName: true, detected: true, configured: true } },
        quotaSnapshots: {
          select: {
            toolName: true,
            usedPercent: true,
            creditsRemaining: true,
            windowType: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.requestMetadata.groupBy({
      by: ["deviceId"],
      where: { orgId, deviceId: { not: null } },
      _count: { id: true },
    }),
  ]);

  const countByDevice = new Map(
    requestCounts.map((row) => [row.deviceId, row._count.id])
  );

  return {
    devices: devices.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      os: d.os,
      architecture: d.architecture,
      agentVersion: d.agentVersion,
      status: d.lastSeenAt > fiveMinAgo ? "online" : "offline",
      lastSeenAt: d.lastSeenAt,
      createdAt: d.createdAt,
      user: d.user,
      toolInstallations: d.toolInstallations,
      quotaSnapshots: d.quotaSnapshots,
      totalRequests: countByDevice.get(d.id) ?? 0,
    })),
  };
}
