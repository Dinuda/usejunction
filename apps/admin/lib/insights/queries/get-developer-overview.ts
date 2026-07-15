import { prisma } from "@usejunction/db";
import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type {
  DeveloperOverviewInput,
  DeveloperOverviewV1,
} from "@/lib/insights/contracts/developer-overview.v1";
import { orgNeedsPlanSync } from "@/lib/queries/me/local-sync-context";
import { aggregateModelUsage, aggregateUsageKpis, groupByTool } from "@/lib/metrics/model-usage";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";
import type { OrganizationRole } from "@/lib/workspace-context";

const overviewInclude = {
  organization: { select: { name: true, slug: true } },
  devices: {
    orderBy: { lastSeenAt: "desc" as const },
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
        orderBy: { updatedAt: "desc" as const },
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
    orderBy: { startDate: "desc" as const },
  },
  toolClaims: { where: { enabled: true }, select: { toolName: true, source: true, observedAt: true } },
};

export async function getDeveloperOverview(
  context: InsightContext,
  input: DeveloperOverviewInput,
): Promise<InsightEnvelope<DeveloperOverviewV1>> {
  assertInsightRoles(context, ["owner", "admin", "developer"]);

  const developer = await prisma.developer.findFirst({
    where: { orgId: context.orgId, id: input.developerId },
    include: overviewInclude,
  });
  if (!developer) {
    throw new Error("developer profile required");
  }

  // Developers may only read their own overview.
  if (context.roles.includes("developer") && !context.roles.some((r) => r === "owner" || r === "admin")) {
    const self = await prisma.developer.findFirst({
      where: { orgId: context.orgId, authUserId: context.actorId },
      select: { id: true },
    });
    if (!self || self.id !== developer.id) {
      throw new Error("FORBIDDEN");
    }
  }

  const metrics = createUsageMetricsStore();
  const [usageRows, dataThrough] = await Promise.all([
    metrics.activityRows({
      orgId: context.orgId,
      window: input.reportWindow,
      developerId: developer.id,
    }),
    metrics.dataThrough(context.orgId),
  ]);

  const usageKpis = aggregateUsageKpis(usageRows);
  const { usage: modelUsage, productivity: productivityModels } = aggregateModelUsage(usageRows);
  const toolRows = groupByTool(usageRows);

  const detectedToolNames = new Set(
    developer.devices.flatMap((device) => device.toolInstallations.map((tool) => tool.toolName)),
  );
  const toolsUsage = [
    ...toolRows.map((row) => ({
      toolName: row.toolName,
      requests: row.modelCalls,
      tokens: row.tokens,
      cost: row.cost,
    })),
    ...Array.from(detectedToolNames)
      .filter((name) => !toolRows.some((row) => row.toolName === name))
      .map((toolName) => ({ toolName, requests: 0, tokens: 0, cost: 0 })),
  ].sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName));

  const onlineThreshold = new Date(context.now.getTime() - 5 * 60_000);
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
  const needsPlanSync = personalNeedsPlanSync || (await orgNeedsPlanSync(context.orgId));
  const role = (input.role ?? developer.role) as OrganizationRole;

  const data: DeveloperOverviewV1 = {
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
      reportedTools: developer.toolClaims,
    },
    usage: {
      requests: usageKpis.modelCalls,
      sessions: usageKpis.sessions,
      inputTokens: String(usageKpis.inputTokens),
      outputTokens: String(usageKpis.outputTokens),
      costMicros: String(
        Math.round((usageKpis.verifiedUsageCost + usageKpis.estimatedApiCost) * 1_000_000),
      ),
    },
    toolsUsage,
    aiCoding: {
      requests: usageKpis.modelCalls,
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
    },
    modelUsage: [
      ...modelUsage.map((row) => ({
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
    ],
    sync: {
      lastSeenAt: primaryDevice?.lastSeenAt?.toISOString() ?? null,
      lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
      lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
      stale: !developer.devices.some((d) => d.lastSeenAt >= onlineThreshold),
      hasLocalEndpoint: developer.devices.some((d) => Boolean(d.localEndpoint)),
      needsPlanSync,
    },
  };

  return makeInsightEnvelope({
    context,
    kind: "developer-overview",
    window: input.reportWindow,
    dataThrough,
    data,
  });
}
