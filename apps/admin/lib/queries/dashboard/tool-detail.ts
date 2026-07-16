import { prisma } from "@usejunction/db";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import { findCatalogTool } from "@/lib/tools/catalog";
import { usageWindowDays } from "@/lib/metrics/date-range";
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
    spend7d: number;
    requests7d: number;
    tokens7d: number;
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
    resetAt: Date | null;
    deviceHostname: string | null;
    developerName: string | null;
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
};

function toolNamesFor(toolKey: string) {
  const tool = findCatalogTool(toolKey);
  if (!tool) return [] as string[];
  return Array.from(new Set([tool.toolName, ...tool.aliases]));
}

export async function getToolDetail(orgId: string, toolKey: string): Promise<ToolDetailData | null> {
  const tool = findCatalogTool(toolKey);
  if (!tool) return null;

  const names = toolNamesFor(toolKey);
  const usage7d = usageWindowDays(7);

  const [installations, accounts, quotas, usageRows, subscriptions, assignments] =
    await Promise.all([
      prisma.toolInstallation.findMany({
        where: { orgId, detected: true, toolName: { in: names } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
      }),
      prisma.toolAccount.findMany({
        where: { orgId, toolName: { in: names } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.quotaSnapshot.findMany({
        where: { orgId, toolName: { in: names } },
        include: {
          device: {
            select: {
              hostname: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      readUsageMetrics({
        orgId,
        window: usage7d,
        measures: ["requests", "inputTokens", "outputTokens", "costMicros"],
        dimensions: ["source"],
        filters: { toolNames: names },
      }),
      listSubscriptions(orgId),
      prisma.developerPlanAssignment.findMany({
        where: {
          orgId,
          active: true,
          seatStatus: "active",
          OR: [
            { toolName: { in: names } },
            { template: { toolKey } },
            { provider: tool.provider, product: tool.product },
          ],
        },
        include: {
          developer: { select: { id: true, name: true, email: true } },
          template: { select: { id: true, catalogPlanKey: true, toolKey: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const plans = subscriptions
    .filter((subscription) => subscription.toolKey === toolKey)
    .map((subscription) => ({
      id: subscription.id,
      toolKey: subscription.toolKey,
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

  const requests7d = usageRows.data.rows.reduce((sum, row) => sum + metricNumber(row, "requests"), 0);
  const spend7d = usageRows.data.rows.reduce((sum, row) => {
    return dimension(row, "source") === "estimated"
      ? sum
      : sum + metricNumber(row, "costMicros") / 1_000_000;
  }, 0);
  const tokens7d = usageRows.data.rows.reduce(
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
    const mapped = account.plan ? mapVendorPlanToCatalog(toolKey, account.plan) : null;
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
      resetAt: quota.resetAt,
      deviceHostname: quota.device?.hostname ?? null,
      developerName: quota.device?.user?.name ?? null,
    });
  }

  const seatsPurchased = plans.reduce((sum, plan) => sum + plan.seatCapacity, 0);
  const seatsAssigned = plans.reduce((sum, plan) => sum + plan.assignedSeats, 0);
  const deviceIds = new Set(installations.map((item) => item.deviceId));

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
      spend7d,
      requests7d,
      tokens7d,
    },
    people,
    quotas: quotaRows,
    plans,
  };
}
