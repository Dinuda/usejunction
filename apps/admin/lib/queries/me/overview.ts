import { prisma } from "@usejunction/db";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";
import { usageDayFilter, usageWindowDays } from "@/lib/metrics/date-range";
import { aggregateModelUsage, aggregateUsageKpis, fetchUsageRows } from "@/lib/metrics/model-usage";
import { orgNeedsPlanSync } from "@/lib/queries/me/local-sync-context";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";
import type { OrganizationRole } from "@/lib/workspace-context";

export interface AiCodingMetrics {
  suggestedLines: number;
  acceptedLines: number;
  addedLines: number;
  deletedLines: number;
  commits: number;
  aiPercent: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  cost: number;
  verifiedCost: number;
}

export interface ModelUsageRow {
  toolName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  cost: number;
  requests: number;
  suggestedLines: number;
  acceptedLines: number;
  source: string;
  verified: boolean;
  costKind: string | null;
  metricKind: "usage" | "productivity";
}

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
      lastUsageSyncAt: Date | null;
      lastAccountSyncAt: Date | null;
      localEndpoint: string | null;
      tools: Array<{ toolName: string; version: string | null; lastCheckedAt: Date | null }>;
      accounts: Array<{
        toolName: string;
        email: string | null;
        plan: string | null;
        authPresent: boolean;
        updatedAt: Date;
      }>;
      quotas: Array<{
        toolName: string;
        windowType: string;
        usedPercent: number | null;
        resetAt: Date | null;
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
  toolsUsage30d: Array<{
    toolName: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  aiCoding30d: AiCodingMetrics;
  modelUsage30d: ModelUsageRow[];
  sync: {
    lastSeenAt: string | null;
    lastUsageSyncAt: string | null;
    lastAccountSyncAt: string | null;
    stale: boolean;
    hasLocalEndpoint: boolean;
    needsPlanSync: boolean;
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
          quotaSnapshots: {
            select: {
              toolName: true,
              windowType: true,
              usedPercent: true,
              resetAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
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

  const usage30d = usageWindowDays(30);
  const [usageRows, toolsUsageRows] = await Promise.all([
    fetchUsageRows({ orgId, developerId: developer.id, from: usage30d.from, to: usage30d.to }),
    prisma.usageDaily.groupBy({
      by: ["toolName"],
      where: {
        orgId,
        developerId: developer.id,
        date: usageDayFilter(usage30d.from, usage30d.to),
        toolName: { not: "" },
        metricKind: { not: "productivity" },
      },
      _sum: { requests: true, inputTokens: true, outputTokens: true, costMicros: true },
    }),
  ]);

  const usageKpis = aggregateUsageKpis(usageRows);
  const { usage: modelUsage30d, productivity: productivityModels } = aggregateModelUsage(usageRows);

  const detectedToolNames = new Set(
    developer.devices.flatMap((device) => device.toolInstallations.map((tool) => tool.toolName)),
  );
  const toolsUsage30d = [
    ...toolsUsageRows.map((row) => ({
      toolName: row.toolName,
      requests: row._sum.requests ?? 0,
      tokens: Number(row._sum.inputTokens ?? BigInt(0)) + Number(row._sum.outputTokens ?? BigInt(0)),
      cost: Number(row._sum.costMicros ?? BigInt(0)) / 1_000_000,
    })),
    ...Array.from(detectedToolNames)
      .filter((name) => !toolsUsageRows.some((row) => row.toolName === name))
      .map((toolName) => ({ toolName, requests: 0, tokens: 0, cost: 0 })),
  ].sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName));

  const modelUsageRows: ModelUsageRow[] = [
    ...modelUsage30d.map((row) => ({
      toolName: row.toolName,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      cost: row.cost,
      requests: row.requests,
      suggestedLines: row.suggestedLines,
      acceptedLines: row.acceptedLines,
      source: row.source,
      verified: row.verified,
      costKind: row.costKind,
      metricKind: "usage" as const,
    })),
    ...productivityModels.map((row) => ({
      toolName: row.toolName,
      model: row.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      cost: 0,
      requests: 0,
      suggestedLines: row.suggestedLines,
      acceptedLines: row.acceptedLines,
      source: row.source,
      verified: false,
      costKind: null,
      metricKind: "productivity" as const,
    })),
  ];

  const aiCoding30d: AiCodingMetrics = {
    suggestedLines: usageKpis.suggestedLines,
    acceptedLines: usageKpis.acceptedLines,
    addedLines: usageKpis.addedLines,
    deletedLines: usageKpis.deletedLines,
    commits: usageKpis.commits,
    aiPercent: null,
    inputTokens: usageKpis.inputTokens,
    outputTokens: usageKpis.outputTokens,
    cacheReadTokens: usageKpis.cacheReadTokens,
    cacheWriteTokens: usageKpis.cacheWriteTokens,
    reasoningTokens: usageKpis.reasoningTokens,
    cost: usageKpis.verifiedUsageCost + usageKpis.estimatedApiCost,
    verifiedCost: usageKpis.verifiedUsageCost,
  };

  const manualBilling = calculateBilling({
    assignments: developer.planAssignments,
    usage: usageRows,
    from: usage30d.from,
    to: usage30d.to,
  }).map(serializeBillingLine);

  const onlineThreshold = new Date(Date.now() - 5 * 60_000);

  const primaryDevice = developer.devices[0] ?? null;
  let latestUsageSync: Date | null = null;
  let latestAccountSync: Date | null = null;
  for (const device of developer.devices) {
    if (device.lastUsageSyncAt && (!latestUsageSync || device.lastUsageSyncAt > latestUsageSync)) {
      latestUsageSync = device.lastUsageSyncAt;
    }
    if (device.lastAccountSyncAt && (!latestAccountSync || device.lastAccountSyncAt > latestAccountSync)) {
      latestAccountSync = device.lastAccountSyncAt;
    }
  }

  const allInstallations = developer.devices.flatMap((device) => device.toolInstallations);
  const allAccounts = developer.devices.flatMap((device) => device.toolAccounts);
  const personalNeedsPlanSync = allInstallations.some((installation) => {
    const toolKey = canonicalToolKey(installation.toolName);
    if (!findCatalogTool(toolKey)) return false;
    const account = allAccounts.find((row) => canonicalToolKey(row.toolName) === toolKey);
    return !account?.plan?.trim();
  });
  const needsPlanSync = personalNeedsPlanSync || (await orgNeedsPlanSync(orgId));

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
        lastUsageSyncAt: device.lastUsageSyncAt ?? null,
        lastAccountSyncAt: device.lastAccountSyncAt ?? null,
        localEndpoint: device.localEndpoint ?? null,
        tools: device.toolInstallations,
        accounts: device.toolAccounts,
        quotas: device.quotaSnapshots,
      })),
      assignedPlans: developer.seatAssignments,
      manualPlans: developer.planAssignments.filter((assignment) => assignment.active),
      manualBilling30d: manualBilling,
      reportedTools: developer.toolClaims,
    },
    usage30d: {
      requests: usageKpis.modelCalls,
      sessions: 0,
      inputTokens: String(usageKpis.inputTokens),
      outputTokens: String(usageKpis.outputTokens),
      costMicros: String(Math.round((usageKpis.verifiedUsageCost + usageKpis.estimatedApiCost) * 1_000_000)),
    },
    toolsUsage30d,
    aiCoding30d,
    modelUsage30d: modelUsageRows,
    sync: {
      lastSeenAt: primaryDevice?.lastSeenAt?.toISOString() ?? null,
      lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
      lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
      stale: !developer.devices.some((d) => d.lastSeenAt >= onlineThreshold),
      hasLocalEndpoint: developer.devices.some((d) => Boolean(d.localEndpoint)),
      needsPlanSync,
    },
  };
}
