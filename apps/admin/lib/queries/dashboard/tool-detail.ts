import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { resolveReportWindow } from "@/lib/analytics/contracts/time-window";
import {
  readModelActivityFromSnapshots,
  readOrgUsageFromSnapshots,
  readDeveloperUsageFromSnapshots,
} from "@/lib/analytics/snapshots";
import { activeDeviceWhere } from "@/lib/devices/decommission";
import { findCatalogTool, subscriptionToolKeys, toolUsageNames } from "@/lib/tools/catalog";
import { mapVendorPlanToCatalog } from "@/lib/tools/sync-detected";
import { listSubscriptions, type listSubscriptions as ListSubscriptions } from "@/lib/tools/subscriptions";
import { isPersonCovered } from "@/lib/queries/dashboard/tool-detail-kpi";

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
    peopleInstallOnly: number;
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
    coverage: "covered" | "install_only";
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
    usageWindowPreference: string;
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
  return toolUsageNames(toolKey);
}

export async function getToolDetail(
  orgId: string,
  toolKey: string,
  reportWindow: MetricWindow = resolveReportWindow({ range: 30 }),
  options: { developerId?: string; subscriptions?: Awaited<ReturnType<typeof ListSubscriptions>> } = {},
): Promise<ToolDetailData | null> {
  const tool = findCatalogTool(toolKey);
  if (!tool) return null;

  const names = toolNamesFor(tool.key);
  const inventoryNames = names;
  const templateKeys = [...subscriptionToolKeys(tool.key)];
  const developerId = options.developerId?.trim() || null;
  const developerFilter = developerId ? { userId: developerId } : {};
  const assignmentDeveloperFilter = developerId ? { developerId } : {};

  const usagePromise = developerId
    ? readDeveloperUsageFromSnapshots(orgId, developerId, reportWindow, {
        includeTools: true,
        toolNames: names,
        ensure: false,
      })
    : readOrgUsageFromSnapshots(orgId, reportWindow, {
        includeTools: true,
        toolNames: names,
        ensure: false,
      });

  const subscriptionsPromise =
    options.subscriptions !== undefined
      ? Promise.resolve(options.subscriptions)
      : listSubscriptions(orgId);

  const activeDeveloperWhere = { removedAt: null };
  const activeDeviceFilter = { ...activeDeviceWhere, user: activeDeveloperWhere };

  const [installations, accounts, quotas, usageSnapshot, subscriptions, assignments, modelRows] =
    await Promise.all([
      prisma.toolInstallation.findMany({
        where: {
          orgId,
          detected: true,
          toolName: { in: inventoryNames },
          ...developerFilter,
          user: activeDeveloperWhere,
          device: activeDeviceFilter,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
      }),
      prisma.toolAccount.findMany({
        where: {
          orgId,
          toolName: { in: inventoryNames },
          ...developerFilter,
          user: activeDeveloperWhere,
          device: activeDeviceFilter,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          device: { select: { hostname: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.quotaSnapshot.findMany({
        where: {
          orgId,
          toolName: { in: inventoryNames },
          device: {
            ...activeDeviceFilter,
            ...(developerId ? { userId: developerId } : {}),
          },
        },
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
      usagePromise,
      subscriptionsPromise,
      prisma.developerPlanAssignment.findMany({
        where: {
          orgId,
          active: true,
          seatStatus: "active",
          ...assignmentDeveloperFilter,
          developer: activeDeveloperWhere,
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
      readModelActivityFromSnapshots(orgId, reportWindow, {
        toolNames: names,
        developerId: developerId ?? undefined,
        ensure: false,
      }),
    ]);

  const plans = developerId
    ? []
    : subscriptions
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
          usageWindowPreference: subscription.usageWindowPreference,
          seatCapacity: subscription.seatCapacity,
          cycleSeatMicros: subscription.cycleSeatMicros,
          estimatedCycleMicros: subscription.estimatedCycleMicros,
          assignedSeats: subscription.assignedSeats,
          availableSeats: subscription.availableSeats,
          customPrice: subscription.customPrice,
          priceSource: subscription.priceSource,
          active: subscription.active,
        }));

  const toolTotals = usageSnapshot.tools;
  const requests = toolTotals.reduce((sum, row) => sum + row.requests, 0);
  const usageCost = toolTotals.reduce((sum, row) => sum + row.cost, 0);
  const tokens = toolTotals.reduce((sum, row) => sum + row.tokens, 0);

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

  const usageByDeveloper = new Set<string>();
  for (const row of modelRows) {
    if (!row.developerId) continue;
    const cost = row.verifiedUsageCost + row.estimatedApiCost;
    if (row.requests > 0 || row.inputTokens > 0 || row.outputTokens > 0 || cost > 0) {
      usageByDeveloper.add(row.developerId);
    }
  }

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
    // Accounts are ordered updatedAt desc — keep the freshest non-null vendor plan.
    peopleMap.set(account.user.id, {
      developerId: account.user.id,
      name: account.user.name,
      email: account.user.email,
      detected: true,
      deviceHostname: existing?.deviceHostname ?? account.device?.hostname ?? null,
      vendorPlan: existing?.vendorPlan ?? account.plan ?? null,
      vendorEmail: existing?.vendorEmail ?? account.email ?? null,
      mappedCatalogPlanKey: existing?.mappedCatalogPlanKey ?? mapped ?? null,
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

  // Usage can land (OTEL / local JSONL) before install+account inventory. Fold those
  // developers into people so Live quotas can surface them instead of Models-only ghosts.
  const usageDeveloperIds = [
    ...new Set(
      modelRows
        .map((row) => row.developerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].filter((id) => !peopleMap.has(id));
  if (usageDeveloperIds.length) {
    const usageDevelopers = await prisma.developer.findMany({
      where: { orgId, id: { in: usageDeveloperIds }, removedAt: null },
      select: { id: true, name: true, email: true },
    });
    for (const developer of usageDevelopers) {
      peopleMap.set(developer.id, {
        developerId: developer.id,
        name: developer.name,
        email: developer.email,
        detected: false,
        deviceHostname: null,
        vendorPlan: null,
        vendorEmail: null,
        mappedCatalogPlanKey: null,
        assignment: null,
        planMismatch: false,
      });
    }
  }

  const people = Array.from(peopleMap.values())
    .map((person) => {
      const covered = isPersonCovered({
        assignment: person.assignment,
        vendorPlan: person.vendorPlan,
        hasUsage: usageByDeveloper.has(person.developerId),
      });
      return {
        ...person,
        coverage: covered ? "covered" : "install_only",
      } as ToolDetailData["people"][number];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const peopleCovered = people.filter((person) => person.coverage === "covered").length;
  const peopleInstallOnly = people.filter((person) => person.coverage === "install_only").length;

  const quotaRows: ToolDetailData["quotas"] = [];
  for (const quota of quotas) {
    const developerIdForRow = quota.device?.user?.id ?? null;
    const hostname = quota.device?.hostname ?? null;
    const already = quotaRows.some(
      (item) =>
        item.windowType === quota.windowType &&
        item.deviceHostname === hostname &&
        item.developerId === developerIdForRow,
    );
    if (already) continue;
    quotaRows.push({
      toolName: quota.toolName,
      windowType: quota.windowType,
      usedPercent: quota.usedPercent,
      creditsRemaining: quota.creditsRemaining,
      resetAt: quota.resetAt,
      deviceHostname: hostname,
      developerId: developerIdForRow,
      developerName: quota.device?.user?.name ?? null,
    });
  }

  const seatsPurchased = plans.reduce((sum, plan) => sum + plan.seatCapacity, 0);
  const seatsAssigned = plans.reduce((sum, plan) => sum + plan.assignedSeats, 0);
  const deviceIds = new Set(installations.map((item) => item.deviceId));

  const modelsByDeveloper: ToolDetailData["modelsByDeveloper"] = [];
  for (const row of modelRows) {
    if (!row.developerId) continue;
    const cost = row.verifiedUsageCost + row.estimatedApiCost;
    if (!row.requests && !row.inputTokens && !row.outputTokens && !cost) continue;
    modelsByDeveloper.push({
      developerId: row.developerId,
      developerName: peopleMap.get(row.developerId)?.name ?? "Unknown developer",
      model: row.modelName || "unknown",
      requests: row.requests,
      tokens: row.inputTokens + row.outputTokens,
      cost,
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
      people: peopleCovered,
      peopleInstallOnly,
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
    modelsByDeveloper,
  };
}
