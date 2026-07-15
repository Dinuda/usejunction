import { prisma } from "@usejunction/db";
import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type {
  ToolDetailInsightInput,
  ToolDetailInsightV1,
} from "@/lib/insights/contracts/tool-detail.v1";
import { aggregateUsageKpis } from "@/lib/metrics/model-usage";
import { findCatalogTool } from "@/lib/tools/catalog";
import { mapVendorPlanToCatalog, syncDetectedPlansForOrg } from "@/lib/tools/sync-detected";
import { listSubscriptions } from "@/lib/tools/subscriptions";

function toolNamesFor(toolKey: string) {
  const tool = findCatalogTool(toolKey);
  if (!tool) return [] as string[];
  return Array.from(new Set([tool.toolName, ...tool.aliases]));
}

export async function getToolDetailInsight(
  context: InsightContext,
  input: ToolDetailInsightInput,
): Promise<InsightEnvelope<ToolDetailInsightV1> | null> {
  assertInsightRoles(context, ["owner", "admin"]);

  const tool = findCatalogTool(input.toolKey);
  if (!tool) return null;

  await syncDetectedPlansForOrg(context.orgId).catch(() => undefined);

  const names = toolNamesFor(input.toolKey);
  const metrics = createUsageMetricsStore();

  const [installations, accounts, quotas, usageRows, subscriptions, assignments, dataThrough] =
    await Promise.all([
      prisma.toolInstallation.findMany({
        where: { orgId: context.orgId, detected: true, toolName: { in: names } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
      }),
      prisma.toolAccount.findMany({
        where: { orgId: context.orgId, toolName: { in: names } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.quotaSnapshot.findMany({
        where: { orgId: context.orgId, toolName: { in: names } },
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
      metrics.activityRows({ orgId: context.orgId, window: input.reportWindow }),
      listSubscriptions(context.orgId),
      prisma.developerPlanAssignment.findMany({
        where: {
          orgId: context.orgId,
          active: true,
          seatStatus: "active",
          OR: [
            { toolName: { in: names } },
            { template: { toolKey: input.toolKey } },
            { provider: tool.provider, product: tool.product },
          ],
        },
        include: {
          developer: { select: { id: true, name: true, email: true } },
          template: { select: { id: true, catalogPlanKey: true, toolKey: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      metrics.dataThrough(context.orgId),
    ]);

  const plans = subscriptions
    .filter((subscription) => subscription.toolKey === input.toolKey)
    .map((subscription) => ({
      id: subscription.id,
      toolKey: subscription.toolKey,
      catalogPlanKey: subscription.catalogPlanKey,
      name: subscription.name,
      tier: subscription.tier,
      billingCadence: subscription.billingCadence,
      seatCapacity: subscription.seatCapacity,
      monthlySeatMicros: subscription.monthlySeatMicros,
      estimatedMonthlyMicros: subscription.estimatedMonthlyMicros,
      assignedSeats: subscription.assignedSeats,
      availableSeats: subscription.availableSeats,
      customPrice: subscription.customPrice,
      priceSource: subscription.priceSource,
      active: subscription.active,
    }));

  const toolUsageRows = usageRows.filter((row) => names.includes(row.toolName));
  const usageKpis = aggregateUsageKpis(toolUsageRows);

  const peopleMap = new Map<string, ToolDetailInsightV1["people"][number]>();

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
    const mapped = account.plan ? mapVendorPlanToCatalog(input.toolKey, account.plan) : null;
    peopleMap.set(account.user.id, {
      developerId: account.user.id,
      name: account.user.name,
      email: account.user.email,
      detected: existing?.detected ?? true,
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
  const quotaRows: ToolDetailInsightV1["quotas"] = [];
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

  const data: ToolDetailInsightV1 = {
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
      spend: usageKpis.verifiedUsageCost + usageKpis.estimatedApiCost,
      requests: usageKpis.modelCalls,
      tokens: usageKpis.inputTokens + usageKpis.outputTokens,
    },
    people,
    quotas: quotaRows,
    plans,
  };

  return makeInsightEnvelope({
    context,
    kind: "tool-detail",
    window: input.reportWindow,
    dataThrough,
    data,
  });
}
