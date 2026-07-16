import { prisma } from "@usejunction/db";
import { usageWindowDays } from "@/lib/metrics/date-range";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";
import { isDeviceOnline } from "@/lib/devices/presence";
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
      cycleSeatMicros: bigint;
      includedCycleMicros: bigint;
      seatCount: number;
      seatStatus: string;
      startDate: Date;
      endDate: Date | null;
      active: boolean;
    }>;
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

type OverviewDeveloper = NonNullable<
  Awaited<ReturnType<typeof prisma.developer.findFirst<{ include: typeof overviewInclude }>>>
>;

export async function getMeOverview(
  orgId: string,
  userId: string,
  role: OrganizationRole
): Promise<MeOverviewData> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    include: overviewInclude,
  });

  if (!developer) {
    throw new Error("developer profile required");
  }

  return buildMeOverview(orgId, developer, role);
}

/** Admin view of any teammate by developer id. */
export async function getDeveloperOverview(
  orgId: string,
  developerId: string,
  options: { reportWindow?: MetricWindow } = {},
): Promise<MeOverviewData | null> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, id: developerId },
    include: overviewInclude,
  });
  if (!developer) return null;
  return buildMeOverview(orgId, developer, developer.role as OrganizationRole, options.reportWindow);
}

async function buildMeOverview(
  orgId: string,
  developer: OverviewDeveloper,
  role: OrganizationRole,
  reportWindow?: MetricWindow,
): Promise<MeOverviewData> {
  const usage30d = reportWindow ?? usageWindowDays(30);
  const measures = [
    "requests", "sessions", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
    "reasoningTokens", "suggestedLines", "acceptedLines", "addedLines", "deletedLines", "commits", "costMicros",
  ] as const;
  const [summary, tools, models, costs] = await Promise.all([
    readUsageMetrics({ orgId, developerId: developer.id, window: usage30d, measures: [...measures], limit: 1 }),
    readUsageMetrics({
      orgId,
      developerId: developer.id,
      window: usage30d,
      measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
      dimensions: ["tool"],
    }),
    readUsageMetrics({
      orgId,
      developerId: developer.id,
      window: usage30d,
      measures: [...measures],
      dimensions: ["tool", "model", "source"],
    }),
    readUsageMetrics({
      orgId,
      developerId: developer.id,
      window: usage30d,
      measures: ["costMicros"],
      dimensions: ["source", "costKind"],
    }),
  ]);

  const summaryRow = summary.data.rows[0];
  const costSummary = summarizeCanonicalCosts(
    costs.data.rows.map((row) => ({
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    })),
  );
  const verifiedUsageCost = costSummary.verifiedUsageCost;
  const estimatedApiCost = costSummary.estimatedApiCost;

  const detectedToolNames = new Set(
    developer.devices.flatMap((device) => device.toolInstallations.map((tool) => tool.toolName)),
  );
  const toolsUsage30d = [
    ...tools.data.rows.map((row) => ({
      toolName: dimension(row, "tool") || "unknown",
      requests: metricNumber(row, "requests"),
      tokens: metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
    })),
    ...Array.from(detectedToolNames)
      .filter((name) => !tools.data.rows.some((row) => dimension(row, "tool") === name))
      .map((toolName) => ({ toolName, requests: 0, tokens: 0, cost: 0 })),
  ].sort((a, b) => b.requests - a.requests || a.toolName.localeCompare(b.toolName));

  const modelUsageRows: ModelUsageRow[] = models.data.rows.flatMap((row) => {
    const source = dimension(row, "source");
    const requests = metricNumber(row, "requests");
    const inputTokens = metricNumber(row, "inputTokens");
    const outputTokens = metricNumber(row, "outputTokens");
    const cost = metricNumber(row, "costMicros") / 1_000_000;
    const suggestedLines = metricNumber(row, "suggestedLines");
    const acceptedLines = metricNumber(row, "acceptedLines");
    const productivity = suggestedLines > 0 || acceptedLines > 0 || metricNumber(row, "commits") > 0;
    const usage = requests > 0 || inputTokens > 0 || outputTokens > 0 || cost > 0;
    const common = {
      toolName: dimension(row, "tool") || "unknown",
      model: dimension(row, "model") || "unknown",
      source,
    };
    const output: ModelUsageRow[] = [];
    if (usage) output.push({
      ...common,
      inputTokens,
      outputTokens,
      cacheReadTokens: metricNumber(row, "cacheReadTokens"),
      cacheWriteTokens: metricNumber(row, "cacheWriteTokens"),
      reasoningTokens: metricNumber(row, "reasoningTokens"),
      cost,
      requests,
      suggestedLines: 0,
      acceptedLines: 0,
      verified: source === "vendor_verified",
      costKind: source === "vendor_verified" ? "verified_usage" : cost > 0 ? "estimated_api" : null,
      metricKind: "usage",
    });
    if (productivity) output.push({
      ...common,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      cost: 0,
      requests: 0,
      suggestedLines,
      acceptedLines,
      verified: false,
      costKind: null,
      metricKind: "productivity",
    });
    return output;
  });

  const aiCoding30d: AiCodingMetrics = {
    suggestedLines: metricNumber(summaryRow, "suggestedLines"),
    acceptedLines: metricNumber(summaryRow, "acceptedLines"),
    addedLines: metricNumber(summaryRow, "addedLines"),
    deletedLines: metricNumber(summaryRow, "deletedLines"),
    commits: metricNumber(summaryRow, "commits"),
    aiPercent: null,
    inputTokens: metricNumber(summaryRow, "inputTokens"),
    outputTokens: metricNumber(summaryRow, "outputTokens"),
    cacheReadTokens: metricNumber(summaryRow, "cacheReadTokens"),
    cacheWriteTokens: metricNumber(summaryRow, "cacheWriteTokens"),
    reasoningTokens: metricNumber(summaryRow, "reasoningTokens"),
    cost: verifiedUsageCost + estimatedApiCost,
    verifiedCost: verifiedUsageCost,
  };

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
        status: isDeviceOnline(device.lastSeenAt) ? "online" : "offline",
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
    usage30d: {
      requests: metricNumber(summaryRow, "requests"),
      sessions: metricNumber(summaryRow, "sessions"),
      inputTokens: String(metricNumber(summaryRow, "inputTokens")),
      outputTokens: String(metricNumber(summaryRow, "outputTokens")),
      costMicros: String(Math.round((verifiedUsageCost + estimatedApiCost) * 1_000_000)),
    },
    toolsUsage30d,
    aiCoding30d,
    modelUsage30d: modelUsageRows,
    sync: {
      lastSeenAt: primaryDevice?.lastSeenAt?.toISOString() ?? null,
      lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
      lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
      stale: !developer.devices.some((device) => isDeviceOnline(device.lastSeenAt)),
      hasLocalEndpoint: developer.devices.some((d) => Boolean(d.localEndpoint)),
      needsPlanSync,
    },
  };
}
