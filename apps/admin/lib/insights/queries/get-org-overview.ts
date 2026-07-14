import { prisma } from "@usejunction/db";
import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  computeActualSpend,
  filterMonthlyCodingSubscriptions,
  observationCoverage,
} from "@/lib/billing/actual-spend";
import { DAY_MS, usageWindowDays, utcDateOnly } from "@/lib/metrics/date-range";
import { aggregateUsageKpis, groupByDay, groupByTool } from "@/lib/metrics/model-usage";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { OrgOverviewV1, OverviewInput } from "@/lib/insights/contracts/overview.v1";
import { buildAttentionItems } from "@/lib/insights/policies/attention";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { readDeviceCoverage } from "@/lib/insights/readers/devices";
import { getDashboardConfigHealth } from "@/lib/queries/dashboard/config-health";
import { isCodingTool } from "@/lib/tools/catalog";

export const ACTIVE_PEOPLE_WINDOW_DAYS = 7;

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

function comparableDelta(current: number, previous: number, previousHadObservation: boolean) {
  if (!previousHadObservation) return null;
  return delta(current, previous);
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fillTrend(
  range: 7 | 30 | 90,
  from: Date,
  rows: Array<{ date: string; modelCalls: number; cost: number }>,
  previousRows: Array<{ date: string; modelCalls: number; cost: number }>,
) {
  const start = utcDateOnly(from);
  const current = new Map(rows.map((row) => [row.date, row]));
  const previous = new Map(previousRows.map((row) => [row.date, row]));
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(start.getTime() + index * DAY_MS);
    const previousDay = new Date(day.getTime() - range * DAY_MS);
    const row = current.get(isoDay(day));
    const previousRow = previous.get(isoDay(previousDay));
    return {
      date: isoDay(day),
      requests: row?.modelCalls ?? 0,
      cost: row?.cost ?? 0,
      previousRequests: previousRow?.modelCalls ?? 0,
      previousCost: previousRow?.cost ?? 0,
    };
  });
}

function toMetricWindow(from: Date, to: Date): MetricWindow {
  return { from, to, timezone: UTC_TIMEZONE, grain: "day" };
}

export async function getOrgOverview(
  context: InsightContext,
  input: OverviewInput,
): Promise<InsightEnvelope<OrgOverviewV1>> {
  assertInsightRoles(context, ["owner", "admin"]);

  const orgId = context.orgId;
  const range = input.range;
  const dates = usageWindowDays(range, context.now);
  const activeDates = usageWindowDays(ACTIVE_PEOPLE_WINDOW_DAYS, context.now);
  const metrics = createUsageMetricsStore();
  const reportWindow = input.reportWindow;
  const previousWindow = input.previousWindow;

  const [
    currentRows,
    previousRows,
    activeObservedCurrent,
    failures,
    totalDevelopers,
    deviceCoverage,
    configuredTools,
    trackedTools,
    health,
    detectedInstallations,
    subscriptionPlans,
    planUsage,
    dataThrough,
  ] = await Promise.all([
    metrics.activityRows({ orgId, window: reportWindow }),
    metrics.activityRows({ orgId, window: previousWindow }),
    prisma.$queryRaw<Array<{ activeDevelopers: number }>>`
      SELECT COUNT(DISTINCT developer_id) FILTER (WHERE developer_id IS NOT NULL)::int AS "activeDevelopers"
      FROM usage_daily
      WHERE org_id = ${orgId} AND date >= ${activeDates.from} AND date <= ${activeDates.to}
        AND metric_kind <> 'productivity' AND requests > 0
    `,
    prisma.$queryRaw<
      Array<{
        id: string;
        createdAt: Date;
        developer: string | null;
        toolName: string | null;
        model: string | null;
        latencyMs: number;
        status: string;
      }>
    >`
      SELECT r.id, r.created_at AS "createdAt", d.name AS developer,
             r.tool_name AS "toolName", r.model, r.latency_ms AS "latencyMs", r.status
      FROM request_metadata r
      LEFT JOIN users d ON d.id = r.user_id
      WHERE r.org_id = ${orgId} AND r.created_at >= ${dates.from} AND r.created_at < ${dates.toExclusive}
        AND r.status <> 'success'
      ORDER BY r.created_at DESC LIMIT 5
    `,
    prisma.developer.count({ where: { orgId } }),
    readDeviceCoverage(orgId, context.now),
    prisma.toolInstallation.count({ where: { orgId, detected: true, configured: true } }),
    prisma.toolInstallation.count({ where: { orgId, detected: true } }),
    getDashboardConfigHealth(orgId),
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, detected: true },
      _count: { id: true },
    }),
    prisma.billingPlanTemplate.findMany({
      where: { orgId, active: true },
      select: {
        monthlySeatMicros: true,
        seatCapacity: true,
        billingCadence: true,
        toolKey: true,
        toolName: true,
        createdAt: true,
      },
    }),
    getPlanUsage(context, { reportWindow }),
    metrics.dataThrough(orgId),
  ]);

  const currentKpis = aggregateUsageKpis(currentRows);
  const previousKpis = aggregateUsageKpis(previousRows);
  const currentTrend = groupByDay(currentRows);
  const previousTrend = groupByDay(previousRows);
  const toolRows = groupByTool(currentRows);

  const subscriptions = filterMonthlyCodingSubscriptions(subscriptionPlans, isCodingTool).map((plan) => ({
    monthlySeatMicros: plan.monthlySeatMicros,
    seatCount: plan.seatCapacity,
    startDate: plan.createdAt,
    endDate: null as Date | null,
  }));

  const actualSpend = computeActualSpend({ subscriptions, from: dates.from, to: dates.to });
  const previousActualSpend = computeActualSpend({
    subscriptions,
    from: dates.previousFrom,
    to: dates.previousTo,
  });

  const daysWithActivity = currentTrend.filter((row) => row.modelCalls > 0).length;
  const previousDaysWithActivity = previousTrend.filter((row) => row.modelCalls > 0).length;
  const firstActivityDate = currentTrend.find((row) => row.modelCalls > 0)?.date ?? null;
  const observation = observationCoverage({
    rangeDays: range,
    daysWithActivity,
    firstActivityDate,
    from: dates.from,
  });
  const previousHadObservation = previousDaysWithActivity > 0;

  const mergedTools = toolRows.map((tool) => ({
    name: tool.toolName,
    requests: tool.modelCalls,
    cost: tool.cost,
    activeDevelopers: tool.activeDevelopers,
  }));
  for (const installation of detectedInstallations) {
    if (!mergedTools.some((tool) => tool.name === installation.toolName)) {
      mergedTools.push({ name: installation.toolName, requests: 0, cost: 0, activeDevelopers: 0 });
    }
  }

  const attention = buildAttentionItems({
    offlineDevices: deviceCoverage.offlineDevices,
    healthIssues: health.issues,
    planVerdicts: planUsage.data.subscriptions.map((row) => ({
      id: row.planTemplateId,
      name: `${row.toolName} ${row.planName}`,
      verdict: row.verdict,
    })),
  });

  const data: OrgOverviewV1 = {
    range,
    period: {
      from: dates.from.toISOString(),
      to: dates.to.toISOString(),
      previousFrom: dates.previousFrom.toISOString(),
      previousTo: dates.previousTo.toISOString(),
    },
    hasActivity:
      currentKpis.modelCalls > 0 ||
      mergedTools.some((tool) => tool.requests > 0) ||
      detectedInstallations.length > 0,
    partialData: currentKpis.partialData || previousKpis.partialData,
    observation,
    kpis: {
      actualSpend: {
        value: actualSpend.total,
        previousValue: previousActualSpend.total,
        deltaPercent: comparableDelta(actualSpend.total, previousActualSpend.total, true),
        basis: actualSpend.basis,
      },
      verifiedUsageCost: {
        value: currentKpis.verifiedUsageCost,
        previousValue: previousKpis.verifiedUsageCost,
        deltaPercent: comparableDelta(
          currentKpis.verifiedUsageCost,
          previousKpis.verifiedUsageCost,
          previousHadObservation,
        ),
      },
      estimatedApiCost: {
        value: currentKpis.estimatedApiCost,
        previousValue: previousKpis.estimatedApiCost,
        deltaPercent: comparableDelta(
          currentKpis.estimatedApiCost,
          previousKpis.estimatedApiCost,
          previousHadObservation,
        ),
      },
      modelCalls: {
        value: currentKpis.modelCalls,
        previousValue: previousKpis.modelCalls,
        deltaPercent: comparableDelta(currentKpis.modelCalls, previousKpis.modelCalls, previousHadObservation),
      },
    },
    trend: fillTrend(range, dates.from, currentTrend, previousTrend),
    attention,
    tools: mergedTools,
    coverage: {
      developers: totalDevelopers,
      activeDevelopers: Number(activeObservedCurrent[0]?.activeDevelopers ?? 0),
      devices: deviceCoverage.devices,
      onlineDevices: deviceCoverage.onlineDevices,
      configuredTools,
      trackedTools,
    },
    failures: failures.map((failure) => ({
      id: failure.id,
      createdAt: new Date(failure.createdAt).toISOString(),
      developer: failure.developer ?? "Unknown developer",
      tool: failure.toolName ?? "Unknown tool",
      model: failure.model ?? "Unknown model",
      latencyMs: Number(failure.latencyMs),
      status: failure.status,
    })),
    planUsageSummary: {
      avgUtilizationPercent: planUsage.data.summary.avgUtilizationPercent,
      nearLimitCount: planUsage.data.summary.nearLimitCount,
      lightUseCount: planUsage.data.summary.lightUseCount,
      noSignalCount: planUsage.data.summary.noSignalCount,
      seatCapacity: planUsage.data.summary.seatCapacity,
      assignedSeats: planUsage.data.summary.assignedSeats,
    },
  };

  return makeInsightEnvelope({
    context,
    kind: "overview",
    window: reportWindow,
    dataThrough,
    data,
  });
}

export function overviewInputFromRange(range: 7 | 30 | 90, now: Date = new Date()): OverviewInput {
  const dates = usageWindowDays(range, now);
  return {
    range,
    reportWindow: toMetricWindow(dates.from, dates.to),
    previousWindow: toMetricWindow(dates.previousFrom, dates.previousTo),
  };
}
