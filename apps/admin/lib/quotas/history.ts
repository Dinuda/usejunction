import { prisma } from "@usejunction/db";
import type { QuotaHistorySample, QuotaUtilization } from "@/lib/billing/plan-utilization-policy";

export async function attachQuotaHistory(
  orgId: string,
  quotas: QuotaUtilization[],
  options: { developerId?: string; now?: Date } = {},
): Promise<QuotaUtilization[]> {
  const current = quotas.filter((quota) => quota.deviceId && quota.resetsAt);
  if (!current.length) return quotas;
  const deviceIds = [...new Set(current.map((quota) => quota.deviceId!))];
  const toolNames = [...new Set(current.map((quota) => quota.observationToolName))];
  const windowTypes = [...new Set(current.map((quota) => quota.windowType))];
  const observations = await prisma.quotaObservation.findMany({
    where: {
      orgId,
      deviceId: { in: deviceIds },
      toolName: { in: toolNames },
      windowType: { in: windowTypes },
      observedAt: { gte: new Date((options.now ?? new Date()).getTime() - 90 * 24 * 60 * 60 * 1000) },
      ...(options.developerId ? { device: { userId: options.developerId } } : {}),
    },
    select: { deviceId: true, toolName: true, windowType: true, resetAt: true, usedPercent: true, observedAt: true },
    orderBy: { observedAt: "asc" },
  });
  const byKey = new Map<string, QuotaHistorySample[]>();
  for (const observation of observations) {
    const key = `${observation.deviceId}:${observation.toolName}:${observation.windowType}`;
    const list = byKey.get(key) ?? [];
    list.push({
      usedPercent: observation.usedPercent,
      observedAt: observation.observedAt.toISOString(),
      resetAt: observation.resetAt.toISOString(),
    });
    byKey.set(key, list);
  }
  return quotas.map((quota) => ({
    ...quota,
    history: quota.deviceId && quota.resetsAt
      ? byKey.get(`${quota.deviceId}:${quota.observationToolName}:${quota.windowType}`) ?? []
      : [],
  }));
}
