import { prisma } from "@usejunction/db";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";
import type { OrganizationRole } from "@/lib/workspace-context";

export interface MeOverviewData {
  developer: {
    id: string;
    name: string;
    email: string;
    role: OrganizationRole;
    organization: { name: string; slug: string };
    devices: Array<{
      id: string;
      hostname: string;
      os: string;
      architecture: string;
      agentVersion: string;
      status: string;
      lastSeenAt: Date;
      tools: Array<{ toolName: string; version: string | null; lastCheckedAt: Date | null }>;
      accounts: Array<{
        toolName: string;
        email: string | null;
        plan: string | null;
        authPresent: boolean;
        updatedAt: Date;
      }>;
    }>;
    assignedPlans: Array<{
      provider: string;
      product: string;
      plan: string | null;
      status: string;
      source: string;
      lastActivityAt: Date | null;
      observedAt: Date;
    }>;
    manualPlans: Array<{
      id: string;
      toolName: string;
      planName: string;
      planTier: string | null;
      currency: string;
      monthlySeatMicros: bigint;
      seatCount: number;
      seatStatus: string;
      startDate: Date;
      endDate: Date | null;
      active: boolean;
    }>;
    manualBilling30d: ReturnType<typeof serializeBillingLine>[];
    reportedTools: Array<{ toolName: string; source: string; observedAt: Date }>;
  };
  usage30d: {
    requests: number;
    sessions: number;
    inputTokens: string;
    outputTokens: string;
    costMicros: string;
  };
}

export async function getMeOverview(
  orgId: string,
  userId: string,
  role: OrganizationRole
): Promise<MeOverviewData> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    include: {
      organization: { select: { name: true, slug: true } },
      devices: {
        orderBy: { lastSeenAt: "desc" },
        include: {
          toolInstallations: {
            where: { detected: true },
            select: { toolName: true, version: true, lastCheckedAt: true },
          },
          toolAccounts: {
            select: { toolName: true, email: true, plan: true, authPresent: true, updatedAt: true },
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
        },
      },
      planAssignments: {
        orderBy: { startDate: "desc" },
      },
      toolClaims: { where: { enabled: true }, select: { toolName: true, source: true, observedAt: true } },
    },
  });

  if (!developer) {
    throw new Error("developer profile required");
  }

  const since = new Date(Date.now() - 30 * 86400_000);
  const [usage, usageRows] = await Promise.all([
    prisma.usageDaily.aggregate({
      where: { orgId, developerId: developer.id, date: { gte: since } },
      _sum: { requests: true, sessions: true, inputTokens: true, outputTokens: true, costMicros: true },
    }),
    prisma.usageDaily.findMany({
      where: { orgId, developerId: developer.id, date: { gte: since } },
      select: {
        date: true,
        source: true,
        costMicros: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        observedAt: true,
        developerId: true,
        provider: true,
        product: true,
        toolName: true,
      },
    }),
  ]);

  const manualBilling = calculateBilling({
    assignments: developer.planAssignments,
    usage: usageRows,
    from: since,
    to: new Date(),
  }).map(serializeBillingLine);

  const onlineThreshold = new Date(Date.now() - 5 * 60_000);

  return {
    developer: {
      id: developer.id,
      name: developer.name,
      email: developer.email,
      role,
      organization: developer.organization,
      devices: developer.devices.map((device) => ({
        id: device.id,
        hostname: device.hostname,
        os: device.os,
        architecture: device.architecture,
        agentVersion: device.agentVersion,
        status: device.lastSeenAt >= onlineThreshold ? "online" : "offline",
        lastSeenAt: device.lastSeenAt,
        tools: device.toolInstallations,
        accounts: device.toolAccounts,
      })),
      assignedPlans: developer.seatAssignments,
      manualPlans: developer.planAssignments.filter((assignment) => assignment.active),
      manualBilling30d: manualBilling,
      reportedTools: developer.toolClaims,
    },
    usage30d: {
      requests: usage._sum.requests ?? 0,
      sessions: usage._sum.sessions ?? 0,
      inputTokens: (usage._sum.inputTokens ?? BigInt(0)).toString(),
      outputTokens: (usage._sum.outputTokens ?? BigInt(0)).toString(),
      costMicros: (usage._sum.costMicros ?? BigInt(0)).toString(),
    },
  };
}
