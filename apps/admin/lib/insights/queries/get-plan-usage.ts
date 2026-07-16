import { prisma } from "@usejunction/db";
import { internalAnalyticsScope, readCanonicalBillingFacts, readDataThrough } from "@/lib/analytics/query";
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
} from "@/lib/insights/contracts/plan-usage.v1";
import { readAssignments } from "@/lib/insights/readers/assignments";
import { readQuotas } from "@/lib/insights/readers/quotas";
import { readSubscriptions } from "@/lib/insights/readers/subscriptions";
import { canonicalToolKey } from "@/lib/tools/catalog";

const DAY_MS = 86_400_000;

function emptyVerdict(): PlanVerdict {
  return evaluatePlanUtilization({ primaryQuota: null, included: null });
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

export async function getPlanUsage(
  context: InsightContext,
  input: PlanUsageInput,
): Promise<InsightEnvelope<PlanUsageV1>> {
  assertInsightRoles(context, ["owner", "admin"]);

  const analyticsScope = internalAnalyticsScope(context.orgId, input.developerId);
  const [subscriptions, assignments, quotaRows, dataThrough] = await Promise.all([
    readSubscriptions(context.orgId),
    readAssignments(context.orgId, { developerId: input.developerId }),
    readQuotas(context.orgId, { developerId: input.developerId }),
    readDataThrough(prisma, analyticsScope),
  ]);
  const assignmentCycles = assignments.map((assignment) => resolveBillingCycle(assignment, context.now));
  const subscriptionCycles = subscriptions.map((subscription) => resolveBillingCycle(subscription, context.now));
  const allCycles = [...assignmentCycles, ...subscriptionCycles];
  const billingWindow = allCycles.length
    ? {
        from: new Date(Math.min(...allCycles.map((cycle) => cycle.cycleStart.getTime()))),
        to: new Date(Math.max(...allCycles.map((cycle) => cycle.cycleEnd.getTime())) - DAY_MS),
        timezone: input.reportWindow.timezone,
        grain: input.reportWindow.grain,
      }
    : input.reportWindow;
  const billingFacts = await readCanonicalBillingFacts(prisma, analyticsScope, billingWindow);

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

  const allQuotas = dedupeQuotaUtilizations(mapQuotaSnapshots(quotaRows, context.now));

  const subscriptionRows: PlanUsageSubscriptionRow[] = subscriptions.map((subscription) => {
    const toolKey = subscription.toolKey ?? canonicalToolKey(subscription.toolName);
    const billingCycle = resolveBillingCycle(subscription, context.now);
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
    const primaryQuota = selectPrimaryQuota(quotas);
    const primaryRatio = primaryUtilizationRatio({ primaryQuota, included });
    const verdict = evaluatePlanUtilization({ primaryQuota, included });
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
      billingCycle: cycleToJson(billingCycle),
      cycleSeatMicros: subscription.cycleSeatMicros.toString(),
      includedCycleMicros: subscription.includedCycleMicros.toString(),
      primaryQuota,
      quotas,
      included,
      primaryRatio,
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
    const primaryQuota = selectPrimaryQuota(quotas);
    const primaryRatio = primaryUtilizationRatio({ primaryQuota, included });
    const verdict = evaluatePlanUtilization({ primaryQuota, included });
    const serialized = line ? serializeBillingLine(line) : null;

    existing.plans.push({
      assignmentId: assignment.id,
      planTemplateId: assignment.planTemplateId,
      toolKey: assignment.template.toolKey,
      toolName: assignment.toolName,
      planName: assignment.planName,
      seatCount: assignment.seatCount,
      billingCadence: assignment.billingCadence,
      billingCycle: cycleToJson(resolveBillingCycle(assignment, context.now)),
      cycleSeatMicros: assignment.cycleSeatMicros.toString(),
      includedCycleMicros: assignment.includedCycleMicros.toString(),
      primaryQuota,
      quotas,
      included,
      primaryRatio,
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
      evaluatePlanUtilization({
        primaryQuota: null,
        included: primaryRatio == null ? null : { includedCycleMicros: "0", grossUsageMicros: "0", rawRatio: primaryRatio, displayRatio: Math.min(primaryRatio, 1) },
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
