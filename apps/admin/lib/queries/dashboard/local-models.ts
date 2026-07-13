import { prisma } from "@usejunction/db";

export interface DashboardLocalModelsData {
  models: Array<{
    id: string;
    provider: string;
    modelName: string;
    size: string | null;
    running: boolean;
    lastSeenAt: Date;
    user: { name: string; email: string } | null;
    device: { hostname: string; os: string } | null;
  }>;
  summary: Array<{
    provider: string;
    modelName: string;
    deviceCount: number;
  }>;
}

export async function getDashboardLocalModels(orgId: string): Promise<DashboardLocalModelsData> {
  const [models, summary] = await Promise.all([
    prisma.localModel.findMany({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        device: { select: { hostname: true, os: true } },
      },
    }),
    prisma.localModel.groupBy({
      by: ["provider", "modelName"],
      where: { orgId },
      _count: { id: true },
    }),
  ]);

  return {
    models: models.map((m) => ({
      id: m.id,
      provider: m.provider,
      modelName: m.modelName,
      size: m.size,
      running: m.running,
      lastSeenAt: m.lastSeenAt,
      user: m.user,
      device: m.device,
    })),
    summary: summary.map((s) => ({
      provider: s.provider,
      modelName: s.modelName,
      deviceCount: s._count.id,
    })),
  };
}
