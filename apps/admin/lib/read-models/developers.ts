import { prisma } from "@usejunction/db";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveReportWindow } from "@/lib/analytics/contracts/time-window";

export async function getDeveloperRoster(
  orgId: string,
  options: { developerId?: string; reportWindow?: MetricWindow } = {},
) {
  const reportWindow = options.reportWindow ?? resolveReportWindow({ range: 30 });
  const [developers, activity, toolActivity] = await Promise.all([
    prisma.developer.findMany({
      where: {
        orgId,
        removedAt: null,
        ...(options.developerId ? { id: options.developerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        devices: {
          where: { decommissionedAt: null },
          select: {
            id: true,
            hostname: true,
            lastSeenAt: true,
            toolInstallations: {
              where: { detected: true },
              select: { toolName: true, version: true },
            },
          },
        },
        seatAssignments: {
          select: {
            provider: true,
            product: true,
            plan: true,
            status: true,
            source: true,
            lastActivityAt: true,
            observedAt: true,
            connection: { select: { id: true, status: true, lastSyncedAt: true } },
          },
        },
        toolClaims: {
          where: { enabled: true },
          select: { toolName: true, source: true, observedAt: true },
        },
        _count: { select: { requestMetadata: true } },
      },
    }),
    readUsageMetrics({
      orgId,
      window: reportWindow,
      measures: ["requests", "costMicros"],
      dimensions: ["developer"],
      ...(options.developerId ? { filters: { developerIds: [options.developerId] } } : {}),
    }),
    readUsageMetrics({
      orgId,
      window: reportWindow,
      measures: ["requests"],
      dimensions: ["developer", "tool"],
      ...(options.developerId ? { filters: { developerIds: [options.developerId] } } : {}),
    }),
  ]);

  const activityMap = new Map(
    activity.data.rows.map((row) => [
      dimension(row, "developer"),
      {
        requests: metricNumber(row, "requests"),
        cost: metricNumber(row, "costMicros") / 1_000_000,
      },
    ]),
  );

  const usedToolsMap = new Map<string, string[]>();
  for (const row of toolActivity.data.rows) {
    const developerId = dimension(row, "developer");
    const toolName = dimension(row, "tool");
    if (!developerId || !toolName || metricNumber(row, "requests") <= 0) continue;
    const existing = usedToolsMap.get(developerId) ?? [];
    existing.push(toolName);
    usedToolsMap.set(developerId, existing);
  }

  return {
    developers: developers.map((developer) => ({
      id: developer.id,
      name: developer.name,
      email: developer.email,
      authUserId: developer.authUserId,
      role: developer.role,
      teamId: developer.teamId,
      createdAt: developer.createdAt,
      totalRequests: developer._count.requestMetadata,
      devices: developer.devices,
      assignedPlans: developer.seatAssignments,
      manualPlans: [] as Array<never>,
      toolEvidence: developer.toolClaims,
      usedTools: [...new Set(usedToolsMap.get(developer.id) ?? [])],
      ...(activityMap.get(developer.id) ?? { requests: 0, cost: 0 }),
    })),
  };
}

export type DeveloperRosterData = Awaited<ReturnType<typeof getDeveloperRoster>>;
