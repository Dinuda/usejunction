import { prisma } from "@usejunction/db";

export type QuotaReaderRow = {
  toolName: string;
  windowType: string;
  usedPercent: number | null;
  creditsRemaining: number | null;
  resetAt: Date | null;
  source: string;
  updatedAt: Date;
  developerId: string | null;
  deviceId: string | null;
};

export async function readQuotas(
  orgId: string,
  options: { developerId?: string } = {},
): Promise<QuotaReaderRow[]> {
  const snapshots = await prisma.quotaSnapshot.findMany({
    where: {
      orgId,
      ...(options.developerId
        ? { device: { userId: options.developerId } }
        : {}),
    },
    select: {
      toolName: true,
      windowType: true,
      usedPercent: true,
      creditsRemaining: true,
      resetAt: true,
      source: true,
      updatedAt: true,
      deviceId: true,
      device: { select: { userId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return snapshots.map((snapshot) => ({
    toolName: snapshot.toolName,
    windowType: snapshot.windowType,
    usedPercent: snapshot.usedPercent,
    creditsRemaining: snapshot.creditsRemaining,
    resetAt: snapshot.resetAt,
    source: snapshot.source,
    updatedAt: snapshot.updatedAt,
    developerId: snapshot.device?.userId ?? null,
    deviceId: snapshot.deviceId,
  }));
}
