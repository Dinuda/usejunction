import { prisma } from "@usejunction/db";
import { inclusiveDayCount, usageWindowDays } from "@/lib/metrics/date-range";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import {
  ensureDeveloperUsageDaySnapshots,
  ensureOrgUsageDaySnapshots,
  readDeveloperUsageFromSnapshots,
} from "@/lib/analytics/snapshots";
import { getDashboardReadiness } from "@/lib/analytics/snapshots/readiness";
import { orgNeedsPlanSync } from "@/lib/queries/me/local-sync-context";
import { canonicalToolKey, findCatalogTool, isCodingTool } from "@/lib/tools/catalog";
import type { OrganizationRole } from "@/lib/workspace-context";
import { rollupPersonalToolsUsage } from "@/lib/queries/me/tools-usage-rollup";
import {
  computePersonalSeatCommitment,
  type SubscriptionSeatRow,
} from "@/lib/billing/actual-spend";
import type { CycleView } from "@/lib/dashboard/cycle-view";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";

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
        creditsRemaining: number | null;
        resetAt: Date | null;
        source: string;
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
    reportedTools: Array<{ toolName: string; source: string; observedAt: Date }>;
  };
  usage30d: {
    requests: number;
    sessions: number;
    inputTokens: string;
    outputTokens: string;
    costMicros: string;
    /** Vendor-verified usage dollars for the selected window. */
    verifiedUsageCost: number;
    /** Modeled API-equivalent dollars when vendor cost is missing. */
    estimatedApiCost: number;
  };
  /** Personal spend KPIs aligned with the team dashboard strip. */
  kpis: {
    subscriptionCommitment: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    tokens: number;
  };
  observation: {
    rangeDays: number;
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
    hasLocalEndpoint: boolean;
    needsPlanSync: boolean;
    dashboardReady: boolean;
    dirtyDayCount: number;
    snapshotLagSeconds: number | null;
  };
}


const overviewInclude = {
  organization: { select: { name: true, slug: true } },
  devices: {
    where: { decommissionedAt: null },
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
          creditsRemaining: true,
          resetAt: true,
          source: true,
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
  toolClaims: { where: { enabled: true }, select: { toolName: true, source: true, observedAt: true } },
};

type OverviewDeveloper = NonNullable<
  Awaited<ReturnType<typeof prisma.developer.findFirst<{ include: typeof overviewInclude }>>>
>;

export async function getMeOverview(
  orgId: string,
  userId: string,
  role: OrganizationRole,
  options: {
    reportWindow?: MetricWindow;
    includeOrgPlanSync?: boolean;
    cycleView?: CycleView;
  } = {},
): Promise<MeOverviewData> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    include: overviewInclude,
  });

  if (!developer) {
    throw new Error("developer profile required");
  }

  return buildMeOverview(orgId, developer, role, options.reportWindow, {
    includeOrgPlanSync: options.includeOrgPlanSync,
    cycleView: options.cycleView,
  });
}

/** Admin view of any teammate by developer id. */
export async function getDeveloperOverview(
  orgId: string,
  developerId: string,
  options: { reportWindow?: MetricWindow; cycleView?: CycleView } = {},
): Promise<MeOverviewData | null> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, id: developerId },
    include: overviewInclude,
  });
  if (!developer) return null;
  return buildMeOverview(orgId, developer, developer.role as OrganizationRole, options.reportWindow, {
    cycleView: options.cycleView,
  });
}

async function buildMeOverview(
  orgId: string,
  developer: OverviewDeveloper,
  role: OrganizationRole,
  reportWindow?: MetricWindow,
  options: { includeOrgPlanSync?: boolean; cycleView?: CycleView } = {},
): Promise<MeOverviewData> {
  const usage30d = reportWindow ?? usageWindowDays(30);
  const cycleView = options.cycleView ?? "last_30_days";
  const snapshotWindow: MetricWindow = {
    from: usage30d.from,
    to: usage30d.to,
    timezone: UTC_TIMEZONE,
    grain: "day",
  };
  // Dashboard spend KPIs + plan-card $ come from sealed developer snapshots (same
  // generation as Team). Productivity / model breakdowns stay on live usage_daily.
  const productivityMeasures = [
    "sessions",
    "cacheReadTokens",
    "cacheWriteTokens",
    "reasoningTokens",
    "suggestedLines",
    "acceptedLines",
    "addedLines",
    "deletedLines",
    "commits",
  ] as const;
  await ensureOrgUsageDaySnapshots(orgId, snapshotWindow.from, snapshotWindow.to);
  await ensureDeveloperUsageDaySnapshots(orgId, developer.id, snapshotWindow.from, snapshotWindow.to);

  const [snapshotUsage, summary, models, planAssignments] = await Promise.all([
    readDeveloperUsageFromSnapshots(orgId, developer.id, snapshotWindow, {
      includeTools: true,
      ensure: false,
    }),
    readUsageMetrics({
      orgId,
      developerId: developer.id,
      window: usage30d,
      measures: [...productivityMeasures],
      limit: 1,
    }),
    readUsageMetrics({
      orgId,
      developerId: developer.id,
      window: usage30d,
      measures: [
        "requests",
        "sessions",
        "inputTokens",
        "outputTokens",
        "cacheReadTokens",
        "cacheWriteTokens",
        "reasoningTokens",
        "suggestedLines",
        "acceptedLines",
        "addedLines",
        "deletedLines",
        "commits",
        "costMicros",
      ],
      dimensions: ["tool", "model", "source"],
    }),
    prisma.developerPlanAssignment.findMany({
      where: {
        orgId,
        developerId: developer.id,
        active: true,
        seatStatus: "active",
      },
      select: {
        id: true,
        toolName: true,
        billingCadence: true,
        billingCycleAnchorDate: true,
        billingCycleDays: true,
        cycleSeatMicros: true,
        seatCount: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const summaryRow = summary.data.rows[0];
  const verifiedUsageCost = snapshotUsage.kpis.verifiedUsageCost;
  const estimatedApiCost = snapshotUsage.kpis.estimatedApiCost;
  const tokens = snapshotUsage.kpis.tokens;
  const inputTokens = snapshotUsage.dayTotals.reduce((sum, row) => sum + row.inputTokens, 0);
  const outputTokens = snapshotUsage.dayTotals.reduce((sum, row) => sum + row.outputTokens, 0);
  const rangeDays = inclusiveDayCount(usage30d.from, usage30d.to);
  const seatRows: SubscriptionSeatRow[] = planAssignments
    .filter((row) => isCodingTool(row.toolName))
    .map((row) => ({
      id: row.id,
      toolName: row.toolName,
      billingCadence: row.billingCadence,
      billingCycleAnchorDate: row.billingCycleAnchorDate,
      billingCycleDays: row.billingCycleDays,
      cycleSeatMicros: row.cycleSeatMicros,
      seatCount: row.seatCount,
      startDate: row.startDate,
      endDate: row.endDate,
    }));
  const subscriptionCommitment = computePersonalSeatCommitment({
    assignments: seatRows,
    view: cycleView,
    from: usage30d.from,
    to: usage30d.to,
  });

  const detectedToolNames = developer.devices.flatMap((device) =>
    device.toolInstallations.map((tool) => tool.toolName),
  );
  const toolsUsage30d = rollupPersonalToolsUsage(
    snapshotUsage.tools.map((row) => ({
      toolName: row.toolName || "unknown",
      requests: row.requests,
      tokens: 0,
      cost: row.cost,
    })),
    detectedToolNames,
  );

  const modelUsageRows: ModelUsageRow[] = models.data.rows.flatMap((row) => {
    const source = dimension(row, "source");
    const requests = metricNumber(row, "requests");
    const rowInputTokens = metricNumber(row, "inputTokens");
    const rowOutputTokens = metricNumber(row, "outputTokens");
    const cost = metricNumber(row, "costMicros") / 1_000_000;
    const suggestedLines = metricNumber(row, "suggestedLines");
    const acceptedLines = metricNumber(row, "acceptedLines");
    const productivity = suggestedLines > 0 || acceptedLines > 0 || metricNumber(row, "commits") > 0;
    const usage = requests > 0 || rowInputTokens > 0 || rowOutputTokens > 0 || cost > 0;
    const common = {
      toolName: dimension(row, "tool") || "unknown",
      model: dimension(row, "model") || "unknown",
      source,
    };
    const output: ModelUsageRow[] = [];
    if (usage) output.push({
      ...common,
      inputTokens: rowInputTokens,
      outputTokens: rowOutputTokens,
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
    inputTokens,
    outputTokens,
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
  const needsPlanSync =
    personalNeedsPlanSync ||
    (options.includeOrgPlanSync === false ? false : await orgNeedsPlanSync(orgId));
  const readiness = await getDashboardReadiness(orgId);

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
        lastSeenAt: device.lastSeenAt,
        lastUsageSyncAt: device.lastUsageSyncAt ?? null,
        lastAccountSyncAt: device.lastAccountSyncAt ?? null,
        localEndpoint: device.localEndpoint ?? null,
        tools: device.toolInstallations,
        accounts: device.toolAccounts,
        quotas: device.quotaSnapshots,
      })),
      assignedPlans: developer.seatAssignments,
      reportedTools: developer.toolClaims,
    },
    usage30d: {
      requests: snapshotUsage.kpis.modelCalls,
      sessions: metricNumber(summaryRow, "sessions"),
      inputTokens: String(inputTokens),
      outputTokens: String(outputTokens),
      costMicros: String(Math.round((verifiedUsageCost + estimatedApiCost) * 1_000_000)),
      verifiedUsageCost,
      estimatedApiCost,
    },
    kpis: {
      subscriptionCommitment,
      verifiedUsageCost,
      estimatedApiCost,
      tokens,
    },
    observation: {
      rangeDays,
    },
    toolsUsage30d,
    aiCoding30d,
    modelUsage30d: modelUsageRows,
    sync: {
      lastSeenAt: primaryDevice?.lastSeenAt?.toISOString() ?? null,
      lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
      lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
      hasLocalEndpoint: developer.devices.some((d) => Boolean(d.localEndpoint)),
      needsPlanSync,
      dashboardReady: readiness.dashboardReady,
      dirtyDayCount: readiness.dirtyDayCount,
      snapshotLagSeconds: readiness.snapshotLagSeconds,
    },
  };
}
