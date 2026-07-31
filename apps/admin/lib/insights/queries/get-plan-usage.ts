import { prisma } from "@usejunction/db";
import { internalAnalyticsScope, readDataThrough } from "@/lib/analytics/query";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  snapshotUtcDay,
} from "@/lib/analytics/snapshots";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";
import { cycleToJson, resolveBillingCycle } from "@/lib/billing/cycles";
import {
  dedupeQuotaUtilizations,
  evaluatePlanUtilization,
  includedAllowanceUtilization,
  mapQuotaSnapshots,
  primaryUtilizationRatio,
  selectPrimaryQuota,
  type PlanVerdict,
} from "@/lib/billing/plan-utilization-policy";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type {
  PlanUsageDeveloperPlanRow,
  PlanUsageDeveloperRow,
  PlanUsageInput,
  PlanUsageSubscriptionRow,
  PlanUsageSummary,
  PlanUsageV1,
  UsageWindowMetadata,
} from "@/lib/insights/contracts/plan-usage.v1";
import { readAssignments } from "@/lib/insights/readers/assignments";
import { readQuotas } from "@/lib/insights/readers/quotas";
import { readSubscriptions } from "@/lib/insights/readers/subscriptions";
import { paceAwarePlanVerdict } from "@/lib/quotas/pace";
import { rolesFor } from "@/lib/rbac/permissions";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";
import { attachQuotaHistory } from "@/lib/quotas/history";
import { projectQuotaPace } from "@/lib/quotas/pace";
import { quotaWindowLabel } from "@/lib/quotas/display";
import { usageWindowPreferenceLabel } from "@/lib/quotas/usage-window";

function emptyVerdict(): PlanVerdict {
  return evaluatePlanUtilization({ primaryQuota: null, included: null });
}

function cycleWindowFromBilling(cycle: { cycleStart: Date; cycleEnd: Date }) {
  return {
    startsAt: cycle.cycleStart.toISOString(),
    endsAt: cycle.cycleEnd.toISOString(),
  };
}

function usageWindowMetadata(
  primaryQuota: { windowType: string; resetsAt: string | null } | null,
  preference: string,
): UsageWindowMetadata | null {
  if (primaryQuota?.resetsAt) {
    return {
      windowType: primaryQuota.windowType,
      label: quotaWindowLabel(primaryQuota.windowType),
      resetAt: primaryQuota.resetsAt,
      preference,
      selectionSource: preference === "auto" ? "auto" : "override",
    };
  }
  if (preference !== "auto") {
    return {
      windowType: "unavailable",
      label: `Awaiting ${usageWindowPreferenceLabel(preference)} window`,
      resetAt: null,
      preference,
      selectionSource: "unavailable",
    };
  }
  return null;
}

function summarize(rows: Array<{ primaryRatio: number | null; verdict: PlanVerdict }>, seat: {
  subscriptions: number;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
}): PlanUsageSummary {
  const withSignal = rows.filter((row) => row.primaryRatio != null);
  const avg =
    withSignal.length > 0
      ? (withSignal.reduce((sum, row) => sum + (row.primaryRatio ?? 0), 0) / withSignal.length) * 100
      : null;
  return {
    ...seat,
    avgUtilizationPercent: avg,
    nearLimitCount: rows.filter((row) => row.verdict.code === "NEAR_LIMIT" || row.verdict.code === "LIMIT_EXCEEDED")
      .length,
    lightUseCount: rows.filter((row) => row.verdict.code === "LIGHT_USE").length,
    noSignalCount: rows.filter((row) => row.verdict.code === "UNKNOWN" || row.verdict.code === "DATA_STALE").length,
  };
}

/** Build billing-fact-shaped usage rows from sealed developer×tool snapshots. */
async function billingFactsFromSnapshots(
  orgId: string,
  window: { from: Date; to: Date },
  developerId?: string,
) {
  const from = snapshotUtcDay(window.from);
  const to = snapshotUtcDay(window.to);
  const rows = await prisma.orgUsageDaySnapshot.findMany({
    where: {
      orgId,
      metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      date: { gte: from, lte: to },
      modelName: "",
      toolName: { not: "" },
      developerId: developerId ? developerId : { not: "" },
    },
    select: {
      date: true,
      developerId: true,
      toolName: true,
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      verifiedUsageCostMicros: true,
      estimatedApiCostMicros: true,
      actualSpendCostMicros: true,
      sourceObservedThrough: true,
    },
  });

  return rows.flatMap((row) => {
    const catalog = findCatalogTool(canonicalToolKey(row.toolName));
    const provider = catalog?.provider ?? "unknown";
    const product = catalog?.product ?? row.toolName;
    const facts: Array<{
      date: Date;
      developerId: string | null;
      provider: string;
      product: string;
      toolName: string;
      source: string;
      costMicros: bigint;
      inputTokens: bigint;
      outputTokens: bigint;
      cacheReadTokens: bigint;
      observedAt: Date;
    }> = [];
    const observedAt = row.sourceObservedThrough ?? row.date;
    if (row.verifiedUsageCostMicros > BigInt(0)) {
      facts.push({
        date: row.date,
        developerId: row.developerId || null,
        provider,
        product,
        toolName: row.toolName,
        source: "vendor_verified",
        costMicros: row.verifiedUsageCostMicros,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        observedAt,
      });
    }
    if (row.estimatedApiCostMicros > BigInt(0)) {
      facts.push({
        date: row.date,
        developerId: row.developerId || null,
        provider,
        product,
        toolName: row.toolName,
        source: "estimated",
        costMicros: row.estimatedApiCostMicros,
        inputTokens: row.verifiedUsageCostMicros > BigInt(0) ? BigInt(0) : row.inputTokens,
        outputTokens: row.verifiedUsageCostMicros > BigInt(0) ? BigInt(0) : row.outputTokens,
        cacheReadTokens: row.verifiedUsageCostMicros > BigInt(0) ? BigInt(0) : row.cacheReadTokens,
        observedAt,
      });
    }
    if (row.actualSpendCostMicros > BigInt(0)) {
      facts.push({
        date: row.date,
        developerId: row.developerId || null,
        provider,
        product,
        toolName: row.toolName,
        source: "invoice_imported",
        costMicros: row.actualSpendCostMicros,
        inputTokens: BigInt(0),
        outputTokens: BigInt(0),
        cacheReadTokens: BigInt(0),
        observedAt,
      });
    }
    if (
      facts.length === 0 &&
      (row.inputTokens > BigInt(0) || row.outputTokens > BigInt(0) || row.cacheReadTokens > BigInt(0))
    ) {
      facts.push({
        date: row.date,
        developerId: row.developerId || null,
        provider,
        product,
        toolName: row.toolName,
        source: "device_observed",
        costMicros: BigInt(0),
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        observedAt,
      });
    }
    return facts;
  });
}

export async function getPlanUsage(
  context: InsightContext,
  input: PlanUsageInput,
  options: { subscriptions?: Awaited<ReturnType<typeof readSubscriptions>> } = {},
): Promise<InsightEnvelope<PlanUsageV1>> {
  assertInsightRoles(context, rolesFor("org_overview"));

  const analyticsScope = internalAnalyticsScope(context.orgId, input.developerId);
  const billingFactsPromise = billingFactsFromSnapshots(
    context.orgId,
    input.reportWindow,
    input.developerId,
  );
  const [subscriptions, assignments, quotaRows, dataThrough, billingFacts] = await Promise.all([
    options.subscriptions ? Promise.resolve(options.subscriptions) : readSubscriptions(context.orgId),
    readAssignments(context.orgId, { developerId: input.developerId }),
    readQuotas(context.orgId, { developerId: input.developerId }),
    readDataThrough(prisma, analyticsScope),
    billingFactsPromise,
  ]);

  const billingLines = calculateBilling({
    assignments,
    usage: billingFacts,
    from: input.reportWindow.from,
    to: input.reportWindow.to,
  });

  const billingByAssignment = new Map<string, (typeof billingLines)[number]>();
  for (const line of billingLines) {
    const existing = billingByAssignment.get(line.assignmentId);
    if (!existing || line.cycleStart > existing.cycleStart) {
      billingByAssignment.set(line.assignmentId, line);
    }
  }

  const allQuotas = await attachQuotaHistory(
    context.orgId,
    dedupeQuotaUtilizations(mapQuotaSnapshots(quotaRows, context.now)),
    { developerId: input.developerId, now: context.now },
  );

  const subscriptionRows: PlanUsageSubscriptionRow[] = subscriptions.map((subscription) => {
    const toolKey = subscription.toolKey ?? canonicalToolKey(subscription.toolName);
    const billingCycle = resolveBillingCycle(subscription, input.reportWindow.to);
    const quotas = allQuotas.filter(
      (quota) => quota.toolKey === toolKey || quota.toolKey === canonicalToolKey(subscription.toolName),
    );
    const templateAssignments = assignments.filter((assignment) => assignment.planTemplateId === subscription.id);
    let grossSeat = BigInt(0);
    let grossUsage = BigInt(0);
    let includedCredits = BigInt(0);
    let net = BigInt(0);
    for (const assignment of templateAssignments) {
      const line = billingByAssignment.get(assignment.id);
      if (!line) continue;
      grossSeat += line.grossSeatMicros;
      grossUsage += line.grossUsageMicros;
      includedCredits += line.includedCreditsMicros;
      net += line.netMicros;
    }
    const included = includedAllowanceUtilization({
      includedCycleMicros: subscription.includedCycleMicros * BigInt(Math.max(1, subscription.assignedSeats || 1)),
      grossUsageMicros: grossUsage,
    });
    const primaryQuota = selectPrimaryQuota(quotas, subscription.usageWindowPreference);
    const primaryRatio = primaryUtilizationRatio({ primaryQuota, included });
    const verdict = paceAwarePlanVerdict({
      primaryQuota,
      included,
      cycleWindow: cycleWindowFromBilling(billingCycle),
      now: context.now,
    });
    const projectionState = primaryQuota?.rawRatio != null
      ? projectQuotaPace(primaryQuota, context.now).projectionState
      : "unavailable" as const;
    return {
      planTemplateId: subscription.id,
      toolKey: subscription.toolKey,
      toolName: subscription.toolName,
      planName: subscription.name,
      tier: subscription.tier,
      seatCapacity: subscription.seatCapacity,
      assignedSeats: subscription.assignedSeats,
      availableSeats: subscription.availableSeats,
      billingCadence: subscription.billingCadence,
      usageWindowPreference: subscription.usageWindowPreference,
      usageWindow: usageWindowMetadata(primaryQuota, subscription.usageWindowPreference),
      billingCycle: cycleToJson(billingCycle),
      cycleSeatMicros: subscription.cycleSeatMicros.toString(),
      includedCycleMicros: subscription.includedCycleMicros.toString(),
      primaryQuota,
      quotas,
      included,
      primaryRatio,
      projectionState,
      verdict,
      billing:
        templateAssignments.length > 0
          ? {
              grossSeatMicros: grossSeat.toString(),
              grossUsageMicros: grossUsage.toString(),
              includedCreditsMicros: includedCredits.toString(),
              netMicros: net.toString(),
            }
          : null,
    };
  });

  const byDeveloper = new Map<string, PlanUsageDeveloperRow>();
  for (const assignment of assignments) {
    const developerId = assignment.developerId;
    const existing = byDeveloper.get(developerId) ?? {
      developerId,
      name: assignment.developer.name,
      email: assignment.developer.email,
      plans: [] as PlanUsageDeveloperPlanRow[],
      primaryRatio: null as number | null,
      verdict: emptyVerdict(),
    };

    const toolKey = assignment.template.toolKey ?? canonicalToolKey(assignment.toolName);
    const quotas = allQuotas.filter(
      (quota) =>
        (quota.developerId == null || quota.developerId === developerId) &&
        (quota.toolKey === toolKey || quota.toolKey === canonicalToolKey(assignment.toolName)),
    );
    const line = billingByAssignment.get(assignment.id);
    const included = includedAllowanceUtilization({
      includedCycleMicros: assignment.includedCycleMicros,
      grossUsageMicros: line?.grossUsageMicros ?? BigInt(0),
    });
    const primaryQuota = selectPrimaryQuota(quotas, assignment.template.usageWindowPreference);
    const primaryRatio = primaryUtilizationRatio({ primaryQuota, included });
    const assignmentCycle = resolveBillingCycle(assignment, input.reportWindow.to);
    const verdict = paceAwarePlanVerdict({
      primaryQuota,
      included,
      cycleWindow: cycleWindowFromBilling(assignmentCycle),
      now: context.now,
    });
    const projectionState = primaryQuota?.rawRatio != null
      ? projectQuotaPace(primaryQuota, context.now).projectionState
      : "unavailable" as const;
    const serialized = line ? serializeBillingLine(line) : null;

    existing.plans.push({
      assignmentId: assignment.id,
      planTemplateId: assignment.planTemplateId,
      toolKey: assignment.template.toolKey,
      toolName: assignment.toolName,
      planName: assignment.planName,
      seatCount: assignment.seatCount,
      billingCadence: assignment.billingCadence,
      usageWindowPreference: assignment.template.usageWindowPreference,
      usageWindow: usageWindowMetadata(primaryQuota, assignment.template.usageWindowPreference),
      billingCycle: cycleToJson(assignmentCycle),
      cycleSeatMicros: assignment.cycleSeatMicros.toString(),
      includedCycleMicros: assignment.includedCycleMicros.toString(),
      primaryQuota,
      quotas,
      included,
      primaryRatio,
      projectionState,
      verdict,
      billing: serialized
        ? {
            cycleStart: serialized.cycleStart,
            cycleEnd: serialized.cycleEnd,
            grossSeatMicros: serialized.grossSeatMicros,
            grossUsageMicros: serialized.grossUsageMicros,
            includedCreditsMicros: serialized.includedCreditsMicros,
            netMicros: serialized.netMicros,
          }
        : null,
    });
    byDeveloper.set(developerId, existing);
  }

  const developers = Array.from(byDeveloper.values()).map((developer) => {
    const ratios = developer.plans.map((plan) => plan.primaryRatio).filter((value): value is number => value != null);
    const primaryRatio = ratios.length ? Math.max(...ratios) : null;
    const worst =
      developer.plans.find((plan) => plan.primaryRatio === primaryRatio)?.verdict ??
      paceAwarePlanVerdict({
        primaryQuota: null,
        included:
          primaryRatio == null
            ? null
            : {
                includedCycleMicros: "0",
                grossUsageMicros: "0",
                rawRatio: primaryRatio,
                displayRatio: Math.min(primaryRatio, 1),
              },
        now: context.now,
      });
    return { ...developer, primaryRatio, verdict: worst };
  });

  const summary = summarize(
    [...subscriptionRows, ...developers],
    {
      subscriptions: subscriptions.length,
      seatCapacity: subscriptions.reduce((sum, row) => sum + row.seatCapacity, 0),
      assignedSeats: subscriptions.reduce((sum, row) => sum + row.assignedSeats, 0),
      availableSeats: subscriptions.reduce((sum, row) => sum + row.availableSeats, 0),
    },
  );

  return makeInsightEnvelope({
    context,
    kind: "plan-usage",
    window: input.reportWindow,
    dataThrough,
    data: {
      summary,
      subscriptions: subscriptionRows,
      developers,
    },
  });
}
