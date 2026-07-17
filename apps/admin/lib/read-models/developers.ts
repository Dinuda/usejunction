import { prisma } from "@usejunction/db";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveReportWindow } from "@/lib/analytics/contracts/time-window";

export async function getDeveloperRoster(
  orgId: string,
  options: { developerId?: string; reportWindow?: MetricWindow } = {},
) {
  const reportWindow = options.reportWindow ?? resolveReportWindow({ range: 30 });
  const [developers, activity] = await Promise.all([
    prisma.developer.findMany({
      where: { orgId, ...(options.developerId ? { id: options.developerId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        devices: {
          select: {
            id: true,
            hostname: true,
            status: true,
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
        planAssignments: {
          where: { active: true },
          select: {
            id: true,
            developerId: true,
            planTemplateId: true,
            provider: true,
            product: true,
            toolName: true,
            planName: true,
            planTier: true,
            currency: true,
            billingCadence: true,
            billingCycleAnchorDate: true,
            billingCycleDays: true,
            cycleSeatMicros: true,
            includedCycleMicros: true,
            inputRateMicrosPerMillion: true,
            outputRateMicrosPerMillion: true,
            cacheRateMicrosPerMillion: true,
            seatCount: true,
            seatStatus: true,
            startDate: true,
            endDate: true,
            source: true,
            active: true,
            vendorAccountEmail: true,
            template: { select: { toolKey: true, catalogPlanKey: true } },
          },
          orderBy: { startDate: "desc" },
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

  return {
    developers: developers.map((developer) => ({
      id: developer.id,
      name: developer.name,
      email: developer.email,
      role: developer.role,
      teamId: developer.teamId,
      createdAt: developer.createdAt,
      totalRequests: developer._count.requestMetadata,
      devices: developer.devices,
      assignedPlans: developer.seatAssignments,
      manualPlans: developer.planAssignments,
      toolEvidence: developer.toolClaims,
      ...(activityMap.get(developer.id) ?? { requests: 0, cost: 0 }),
    })),
  };
}

export type DeveloperRosterData = Awaited<ReturnType<typeof getDeveloperRoster>>;
