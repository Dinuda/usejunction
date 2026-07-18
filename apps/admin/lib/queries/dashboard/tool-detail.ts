import { prisma } from "@usejunction/db";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveReportWindow } from "@/lib/analytics/contracts/time-window";
import { findCatalogTool, subscriptionToolKeys, toolUsageNames } from "@/lib/tools/catalog";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";
import { mapVendorPlanToCatalog } from "@/lib/tools/sync-detected";
import { listSubscriptions } from "@/lib/tools/subscriptions";

export type ToolDetailData = {
  toolKey: string;
  name: string;
  shortName: string;
  provider: string;
  product: string;
  toolName: string;
  aliases: readonly string[];
  sourceUrl: string;
  kpis: {
    devices: number;
    people: number;
    seatsFree: number;
    seatsPurchased: number;
    seatsAssigned: number;
    usageCost: number;
    requests: number;
    tokens: number;
  };
  people: Array<{
    developerId: string;
    name: string;
    email: string;
    detected: boolean;
    deviceHostname: string | null;
    vendorPlan: string | null;
    vendorEmail: string | null;
    mappedCatalogPlanKey: string | null;
    assignment: {
      id: string;
      planTemplateId: string;
      planName: string;
      catalogPlanKey: string | null;
      source: string;
    } | null;
    planMismatch: boolean;
  }>;
  quotas: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
    resetAt: Date | null;
    deviceHostname: string | null;
    developerId: string | null;
    developerName: string | null;
  }>;
  modelsByDeveloper: Array<{
    developerId: string;
    developerName: string;
    model: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  plans: Array<{
    id: string;
    toolKey: string | null;
    catalogPlanKey: string | null;
    name: string;
    tier: string | null;
    billingCadence: string;
    seatCapacity: number;
    cycleSeatMicros: bigint;
    estimatedCycleMicros: bigint;
    assignedSeats: number;
    availableSeats: number;
    customPrice: boolean;
    priceSource: string;
    active: boolean;
  }>;
  toolsUsed: Array<{ name: string; calls: number }>;
  toolSequences: Array<{ digest: string; sessions: number }>;
};

function toolNamesFor(toolKey: string) {
  return toolUsageNames(toolKey);
}

export async function getToolDetail(
  orgId: string,
  toolKey: string,
  reportWindow: MetricWindow = resolveReportWindow({ range: 30 }),
): Promise<ToolDetailData | null> {
  const tool = findCatalogTool(toolKey);
  if (!tool) return null;

  const names = toolNamesFor(tool.key);
  const inventoryNames = names;
  const templateKeys = [...subscriptionToolKeys(tool.key)];
  const windowStart = reportWindow.from;
  const windowEnd = reportWindow.to;

  const [installations, accounts, quotas, usageRows, subscriptions, assignments, inventoryRows, modelRows] =
    await Promise.all([
      prisma.toolInstallation.findMany({
        where: { orgId, detected: true, toolName: { in: inventoryNames } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
      }),
      prisma.toolAccount.findMany({
        where: { orgId, toolName: { in: inventoryNames } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.quotaSnapshot.findMany({
        where: { orgId, toolName: { in: inventoryNames } },
        include: {
          device: {
            select: {
              hostname: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      readUsageMetrics({
        orgId,
        window: reportWindow,
        measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
        dimensions: ["source", "costKind"],
        filters: { toolNames: names },
      }),
      listSubscriptions(orgId),
      prisma.developerPlanAssignment.findMany({
        where: {
          orgId,
          active: true,
          seatStatus: "active",
          OR: [
            { toolName: { in: inventoryNames } },
            { template: { toolKey: { in: templateKeys } } },
            { provider: tool.provider, product: tool.product },
          ],
        },
        include: {
          developer: { select: { id: true, name: true, email: true } },
          template: { select: { id: true, catalogPlanKey: true, toolKey: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.localUsageAggregate.findMany({
        where: {
          orgId,
          toolName: { in: names },
          metricKind: "productivity",
          date: { gte: windowStart, lte: windowEnd },
          OR: [{ model: { startsWith: "tool:" } }, { model: { startsWith: "flow:" } }],
        },
        select: { model: true, requests: true },
      }),
      readUsageMetrics({
        orgId,
        window: reportWindow,
        measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
        dimensions: ["developer", "model"],
        filters: { toolNames: names },
      }),
    ]);

  const plans = subscriptions
    .filter(
      (subscription) =>
        subscription.toolKey != null && (templateKeys as readonly string[]).includes(subscription.toolKey),
    )
    .map((subscription) => ({
      id: subscription.id,
      toolKey: tool.key,
      catalogPlanKey: subscription.catalogPlanKey,
      name: subscription.name,
      tier: subscription.tier,
      billingCadence: subscription.billingCadence,
      seatCapacity: subscription.seatCapacity,
      cycleSeatMicros: subscription.cycleSeatMicros,
      estimatedCycleMicros: subscription.estimatedCycleMicros,
      assignedSeats: subscription.assignedSeats,
      availableSeats: subscription.availableSeats,
      customPrice: subscription.customPrice,
      priceSource: subscription.priceSource,
      active: subscription.active,
    }));

  const requests = usageRows.data.rows.reduce((sum, row) => sum + metricNumber(row, "requests"), 0);
  const usageCost = summarizeCanonicalCosts(
    usageRows.data.rows.map((row) => ({
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    })),
  ).totalUsageCost;
  const tokens = usageRows.data.rows.reduce(
    (sum, row) => sum + metricNumber(row, "inputTokens") + metricNumber(row, "outputTokens"),
    0,
  );

  const peopleMap = new Map<
    string,
    {
      developerId: string;
      name: string;
      email: string;
      detected: boolean;
      deviceHostname: string | null;
      vendorPlan: string | null;
      vendorEmail: string | null;
      mappedCatalogPlanKey: string | null;
      assignment: ToolDetailData["people"][number]["assignment"];
      planMismatch: boolean;
    }
  >();

  for (const installation of installations) {
    const existing = peopleMap.get(installation.user.id);
    peopleMap.set(installation.user.id, {
      developerId: installation.user.id,
      name: installation.user.name,
      email: installation.user.email,
      detected: true,
      deviceHostname: installation.device?.hostname ?? existing?.deviceHostname ?? null,
      vendorPlan: existing?.vendorPlan ?? null,
      vendorEmail: existing?.vendorEmail ?? null,
      mappedCatalogPlanKey: existing?.mappedCatalogPlanKey ?? null,
      assignment: existing?.assignment ?? null,
      planMismatch: false,
    });
  }

  for (const account of accounts) {
    const existing = peopleMap.get(account.user.id);
    const mapped = account.plan ? mapVendorPlanToCatalog(tool.key, account.plan) : null;
    peopleMap.set(account.user.id, {
      developerId: account.user.id,
      name: account.user.name,
      email: account.user.email,
      detected: true,
      deviceHostname: existing?.deviceHostname ?? account.device?.hostname ?? null,
      vendorPlan: account.plan ?? existing?.vendorPlan ?? null,
      vendorEmail: account.email ?? existing?.vendorEmail ?? null,
      mappedCatalogPlanKey: mapped ?? existing?.mappedCatalogPlanKey ?? null,
      assignment: existing?.assignment ?? null,
      planMismatch: false,
    });
  }

  for (const assignment of assignments) {
    const existing = peopleMap.get(assignment.developer.id);
    const catalogPlanKey = assignment.template.catalogPlanKey;
    const mapped = existing?.mappedCatalogPlanKey ?? null;
    const planMismatch =
      Boolean(mapped) &&
      Boolean(catalogPlanKey) &&
      mapped !== catalogPlanKey &&
      assignment.source === "detected";

    peopleMap.set(assignment.developer.id, {
      developerId: assignment.developer.id,
      name: assignment.developer.name,
      email: assignment.developer.email,
      detected: existing?.detected ?? false,
      deviceHostname: existing?.deviceHostname ?? null,
      vendorPlan: existing?.vendorPlan ?? null,
      vendorEmail: existing?.vendorEmail ?? assignment.vendorAccountEmail,
      mappedCatalogPlanKey: mapped,
      assignment: {
        id: assignment.id,
        planTemplateId: assignment.planTemplateId,
        planName: assignment.planName,
        catalogPlanKey,
        source: assignment.source,
      },
      planMismatch,
    });
  }

  const people = Array.from(peopleMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const quotaRows: ToolDetailData["quotas"] = [];
  for (const quota of quotas) {
    const already = quotaRows.some(
      (item) =>
        item.windowType === quota.windowType &&
        item.deviceHostname === (quota.device?.hostname ?? null),
    );
    if (already) continue;
    quotaRows.push({
      toolName: quota.toolName,
      windowType: quota.windowType,
      usedPercent: quota.usedPercent,
      creditsRemaining: quota.creditsRemaining,
      resetAt: quota.resetAt,
      deviceHostname: quota.device?.hostname ?? null,
      developerId: quota.device?.user?.id ?? null,
      developerName: quota.device?.user?.name ?? null,
    });
  }

  const seatsPurchased = plans.reduce((sum, plan) => sum + plan.seatCapacity, 0);
  const seatsAssigned = plans.reduce((sum, plan) => sum + plan.assignedSeats, 0);
  const deviceIds = new Set(installations.map((item) => item.deviceId));

  const toolCallCounts = new Map<string, number>();
  const flowCounts = new Map<string, number>();
  for (const row of inventoryRows) {
    if (row.model.startsWith("tool:")) {
      const name = row.model.slice("tool:".length);
      if (!name) continue;
      toolCallCounts.set(name, (toolCallCounts.get(name) ?? 0) + row.requests);
    } else if (row.model.startsWith("flow:")) {
      const digest = row.model.slice("flow:".length);
      if (!digest) continue;
      flowCounts.set(digest, (flowCounts.get(digest) ?? 0) + row.requests);
    }
  }
  const toolsUsed = Array.from(toolCallCounts.entries())
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
    .slice(0, 24);
  const toolSequences = Array.from(flowCounts.entries())
    .map(([digest, sessions]) => ({ digest, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.digest.localeCompare(b.digest))
    .slice(0, 8);

  const modelsByDeveloper: ToolDetailData["modelsByDeveloper"] = [];
  for (const row of modelRows.data.rows) {
    const developerId = dimension(row, "developer");
    const model = dimension(row, "model") || "unknown";
    if (!developerId) continue;
    const requests = metricNumber(row, "requests");
    const inputTokens = metricNumber(row, "inputTokens");
    const outputTokens = metricNumber(row, "outputTokens");
    const costMicros = metricNumber(row, "costMicros");
    if (!requests && !inputTokens && !outputTokens && !costMicros) continue;
    modelsByDeveloper.push({
      developerId,
      developerName: peopleMap.get(developerId)?.name ?? "Unknown developer",
      model,
      requests,
      tokens: inputTokens + outputTokens,
      cost: costMicros / 1_000_000,
    });
  }
  modelsByDeveloper.sort(
    (a, b) =>
      b.cost - a.cost ||
      b.requests - a.requests ||
      a.developerName.localeCompare(b.developerName) ||
      a.model.localeCompare(b.model),
  );

  return {
    toolKey: tool.key,
    name: tool.name,
    shortName: tool.shortName,
    provider: tool.provider,
    product: tool.product,
    toolName: tool.toolName,
    aliases: tool.aliases,
    sourceUrl: tool.sourceUrl,
    kpis: {
      devices: deviceIds.size,
      people: people.length,
      seatsFree: Math.max(0, seatsPurchased - seatsAssigned),
      seatsPurchased,
      seatsAssigned,
      usageCost,
      requests,
      tokens,
    },
    people,
    quotas: quotaRows,
    plans,
    toolsUsed,
    toolSequences,
    modelsByDeveloper,
  };
}
