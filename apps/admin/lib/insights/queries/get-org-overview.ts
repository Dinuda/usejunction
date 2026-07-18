import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { dimension, metricNumber, readUsageMetrics } from "@/lib/analytics/query";
import {
  filterCycleCodingSubscriptions,
  microsToDollars,
  observationCoverage,
} from "@/lib/billing/actual-spend";
import { addCycles, cycleToJson, resolveBillingCycleOffset, type BillingCycle } from "@/lib/billing/cycles";
import {
  DAY_MS,
  inclusiveDayCount,
  usageExclusiveEnd,
  usageInclusiveEnd,
  usageWindowDays,
  utcDateOnly,
} from "@/lib/metrics/date-range";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";
import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type { OrgOverviewV1, OverviewInput } from "@/lib/insights/contracts/overview.v1";
import { buildAttentionItems } from "@/lib/insights/policies/attention";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { rollupSubscriptionCyclesByTool, enrichSubscriptionCyclesWithUtilization, filterActiveSubscriptionCycles } from "@/lib/insights/queries/rollup-subscription-cycles";
import { readDeviceCoverage } from "@/lib/insights/readers/devices";
import { getDashboardConfigHealth } from "@/lib/queries/dashboard/config-health";
import { isCodingTool, toolUsageNames } from "@/lib/tools/catalog";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fillTrend(
  range: number,
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

async function readOverviewUsage(
  orgId: string,
  window: MetricWindow,
  includeTools: boolean,
  filters: { toolNames?: string[] } = {},
) {
  const [summary, costs, trend, tools] = await Promise.all([
    readUsageMetrics({ orgId, window, measures: ["requests"], filters, limit: 1 }),
    readUsageMetrics({ orgId, window, measures: ["costMicros"], dimensions: ["source", "costKind"], filters }),
    readUsageMetrics({ orgId, window, measures: ["requests", "costMicros"], dimensions: ["day"], filters }),
    includeTools
      ? readUsageMetrics({
          orgId,
          window,
          measures: ["requests", "costMicros", "activeDevelopers"],
          dimensions: ["tool"],
          filters,
        })
      : Promise.resolve(null),
  ]);

  const costSummary = summarizeCanonicalCosts(
    costs.data.rows.map((row) => ({
      costMicros: metricNumber(row, "costMicros"),
      costKind: dimension(row, "costKind"),
    })),
  );

  return {
    dataThrough: summary.dataThrough ? new Date(summary.dataThrough) : null,
    kpis: {
      modelCalls: metricNumber(summary.data.rows[0], "requests"),
      verifiedUsageCost: costSummary.verifiedUsageCost,
      estimatedApiCost: costSummary.estimatedApiCost,
      partialData: false,
    },
    trend: trend.data.rows.map((row) => ({
      date: dimension(row, "day"),
      modelCalls: metricNumber(row, "requests"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
    })),
    tools: tools?.data.rows.map((row) => ({
      toolName: dimension(row, "tool") || "unknown",
      modelCalls: metricNumber(row, "requests"),
      cost: metricNumber(row, "costMicros") / 1_000_000,
      activeDevelopers: metricNumber(row, "activeDevelopers"),
    })) ?? [],
  };
}

type CycleView = NonNullable<OverviewInput["cycleView"]>;

type SubscriptionCycleSource = {
  id: string;
  name: string;
  toolName: string;
  toolKey: string | null;
  usageToolNames: string[];
  billingCadence: string;
  billingCycleAnchorDate: Date | null;
  billingCycleDays: number | null;
  cycleSeatMicros: bigint;
  seatCount: number;
  startDate: Date;
  endDate: Date | null;
};

type SubscriptionSlice = {
  id: string;
  subscriptionId: string;
  name: string;
  toolName: string;
  toolKey: string | null;
  usageToolNames: string[];
  cycle: BillingCycle;
  windowFrom: Date;
  windowTo: Date;
  allocationRatio: number;
  seatCount: number;
  spendMicros: bigint;
};

function overlapDays(fromInclusive: Date, toExclusive: Date, otherFromInclusive: Date, otherToExclusive: Date) {
  const start = new Date(Math.max(fromInclusive.getTime(), otherFromInclusive.getTime()));
  const end = new Date(Math.min(toExclusive.getTime(), otherToExclusive.getTime()));
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function prorateMicros(value: bigint, ratio: number) {
  return BigInt(Math.round(Number(value) * ratio));
}

function sliceWindow(cycle: BillingCycle, rangeStart: Date, rangeEndExclusive: Date) {
  const from = new Date(Math.max(cycle.cycleStart.getTime(), rangeStart.getTime()));
  const toExclusive = new Date(Math.min(cycle.cycleEnd.getTime(), rangeEndExclusive.getTime()));
  const days = overlapDays(cycle.cycleStart, cycle.cycleEnd, from, toExclusive);
  return { from, toExclusive, days };
}

function usageToolKey(toolNames: string[]) {
  return [...new Set(toolNames)].sort().join("\u0001");
}

function buildSubscriptionSlices(input: {
  subscriptions: SubscriptionCycleSource[];
  view: CycleView;
  now: Date;
  last30: { from: Date; toExclusive: Date };
}) {
  const slices: SubscriptionSlice[] = [];
  for (const subscription of input.subscriptions) {
    const baseCycle =
      input.view === "previous_cycles"
        ? resolveBillingCycleOffset(subscription, input.now, -1)
        : resolveBillingCycleOffset(subscription, input.now, 0);

    const cycles =
      input.view !== "last_30_days"
        ? [baseCycle]
        : (() => {
            const rows: BillingCycle[] = [];
            let cursor = resolveBillingCycleOffset(subscription, input.last30.from, 0);
            while (cursor.cycleStart < input.last30.toExclusive) {
              if (overlapDays(cursor.cycleStart, cursor.cycleEnd, input.last30.from, input.last30.toExclusive) > 0) {
                rows.push(cursor);
              }
              const nextStart = cursor.cycleEnd;
              const nextEnd = addCycles(nextStart, subscription.billingCadence, 1, subscription.billingCycleDays);
              cursor = {
                cycleStart: nextStart,
                cycleEnd: nextEnd,
                nextRenewalDate: nextEnd,
                elapsedPercent: 1,
                remainingDays: 0,
                totalDays: Math.max(1, Math.round((nextEnd.getTime() - nextStart.getTime()) / DAY_MS)),
              };
            }
            return rows;
          })();

    for (const cycle of cycles) {
      const window =
        input.view === "last_30_days"
          ? sliceWindow(cycle, input.last30.from, input.last30.toExclusive)
          : { from: cycle.cycleStart, toExclusive: cycle.cycleEnd, days: cycle.totalDays };
      if (window.days <= 0) continue;
      const allocationRatio = input.view === "last_30_days" ? window.days / cycle.totalDays : 1;
      const fullSpend = subscription.cycleSeatMicros * BigInt(subscription.seatCount);
      const spendMicros = input.view === "last_30_days" ? prorateMicros(fullSpend, allocationRatio) : fullSpend;
      slices.push({
        id: `${subscription.id}:${cycle.cycleStart.toISOString().slice(0, 10)}`,
        subscriptionId: subscription.id,
        name: subscription.name,
        toolName: subscription.toolName,
        toolKey: subscription.toolKey,
        usageToolNames: subscription.usageToolNames,
        cycle,
        windowFrom: window.from,
        windowTo: new Date(window.toExclusive.getTime() - DAY_MS),
        allocationRatio,
        seatCount: subscription.seatCount,
        spendMicros,
      });
    }
  }
  return slices;
}

async function readAllocatedCycleUsage(orgId: string, slices: SubscriptionSlice[], view: CycleView) {
  const usageBySlice = new Map<string, { modelCalls: number; verifiedUsageCost: number; estimatedApiCost: number }>();
  for (const slice of slices) {
    usageBySlice.set(slice.id, { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 });
  }

  if (view !== "last_30_days") {
    const groups = new Map<string, { slices: SubscriptionSlice[]; totalSeats: number; toolNames: string[]; from: Date; to: Date }>();
    for (const slice of slices) {
      const key = `${usageToolKey(slice.usageToolNames)}:${isoDay(slice.windowFrom)}:${isoDay(slice.windowTo)}`;
      const group = groups.get(key) ?? {
        slices: [],
        totalSeats: 0,
        toolNames: slice.usageToolNames,
        from: slice.windowFrom,
        to: slice.windowTo,
      };
      group.slices.push(slice);
      group.totalSeats += Math.max(1, slice.seatCount);
      groups.set(key, group);
    }
    await Promise.all(Array.from(groups.values()).map(async (group) => {
      const usage = await readOverviewUsage(
        orgId,
        toMetricWindow(group.from, group.to),
        false,
        { toolNames: group.toolNames },
      );
      for (const slice of group.slices) {
        const share = Math.max(1, slice.seatCount) / Math.max(1, group.totalSeats);
        usageBySlice.set(slice.id, {
          modelCalls: usage.kpis.modelCalls * share,
          verifiedUsageCost: usage.kpis.verifiedUsageCost * share,
          estimatedApiCost: usage.kpis.estimatedApiCost * share,
        });
      }
    }));
    return usageBySlice;
  }

  const groups = new Map<string, { toolNames: string[]; slices: SubscriptionSlice[] }>();
  for (const slice of slices) {
    const key = usageToolKey(slice.usageToolNames);
    const group = groups.get(key) ?? { toolNames: slice.usageToolNames, slices: [] };
    group.slices.push(slice);
    groups.set(key, group);
  }

  await Promise.all(Array.from(groups.values()).map(async (group) => {
    const toolSlices = group.slices;
    const from = new Date(Math.min(...toolSlices.map((slice) => slice.windowFrom.getTime())));
    const to = new Date(Math.max(...toolSlices.map((slice) => slice.windowTo.getTime())));
    const [requests, costs] = await Promise.all([
      readUsageMetrics({
        orgId,
        window: toMetricWindow(from, to),
        measures: ["requests"],
        dimensions: ["day"],
        filters: { toolNames: group.toolNames },
      }),
      readUsageMetrics({
        orgId,
        window: toMetricWindow(from, to),
        measures: ["costMicros"],
        dimensions: ["day", "source", "costKind"],
        filters: { toolNames: group.toolNames },
      }),
    ]);

    const daily = new Map<string, { modelCalls: number; verifiedUsageCost: number; estimatedApiCost: number }>();
    for (const row of requests.data.rows) {
      const day = dimension(row, "day");
      const existing = daily.get(day) ?? { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 };
      existing.modelCalls += metricNumber(row, "requests");
      daily.set(day, existing);
    }
    for (const row of costs.data.rows) {
      const day = dimension(row, "day");
      const existing = daily.get(day) ?? { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 };
      const summary = summarizeCanonicalCosts([{
        costMicros: metricNumber(row, "costMicros"),
        costKind: dimension(row, "costKind"),
      }]);
      existing.verifiedUsageCost += summary.verifiedUsageCost;
      existing.estimatedApiCost += summary.estimatedApiCost;
      daily.set(day, existing);
    }

    for (const [day, usage] of daily) {
      const date = new Date(`${day}T00:00:00.000Z`);
      const active = toolSlices.filter((slice) => slice.windowFrom <= date && date <= slice.windowTo);
      const totalSeats = active.reduce((sum, slice) => sum + Math.max(1, slice.seatCount), 0);
      for (const slice of active) {
        const share = Math.max(1, slice.seatCount) / Math.max(1, totalSeats);
        const current = usageBySlice.get(slice.id) ?? { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 };
        current.modelCalls += usage.modelCalls * share;
        current.verifiedUsageCost += usage.verifiedUsageCost * share;
        current.estimatedApiCost += usage.estimatedApiCost * share;
        usageBySlice.set(slice.id, current);
      }
    }
  }));
  return usageBySlice;
}

export async function getOrgOverview(
  context: InsightContext,
  input: OverviewInput,
): Promise<InsightEnvelope<OrgOverviewV1>> {
  assertInsightRoles(context, ["owner", "admin"]);

  const orgId = context.orgId;
  const cycleView: CycleView = input.cycleView ?? "current_cycles";
  const reportWindow = input.reportWindow;
  const previousWindow = input.previousWindow;
  const range = inclusiveDayCount(reportWindow.from, reportWindow.to);
  const dates = {
    from: utcDateOnly(reportWindow.from),
    to: usageInclusiveEnd(reportWindow.to),
    toExclusive: usageExclusiveEnd(reportWindow.to),
    previousFrom: utcDateOnly(previousWindow.from),
    previousTo: usageInclusiveEnd(previousWindow.to),
    previousToExclusive: usageExclusiveEnd(previousWindow.to),
  };
  const [
    currentUsage,
    previousUsage,
    activeUsage,
    failures,
    totalDevelopers,
    deviceCoverage,
    configuredTools,
    trackedTools,
    health,
    detectedInstallations,
    subscriptionPlans,
    planUsage,
  ] = await Promise.all([
    readOverviewUsage(orgId, reportWindow, true),
    readOverviewUsage(orgId, previousWindow, false),
    readUsageMetrics({
      orgId,
      window: reportWindow,
      measures: ["activeDevelopers"],
      limit: 1,
    }),
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
        cycleSeatMicros: true,
        id: true,
        name: true,
        seatCapacity: true,
        billingCadence: true,
        billingCycleAnchorDate: true,
        billingCycleDays: true,
        toolKey: true,
        toolName: true,
        createdAt: true,
      },
    }),
    getPlanUsage(context, { reportWindow }),
  ]);

  const previousKpis = previousUsage.kpis;
  const usageKpis = currentUsage.kpis;
  const currentTrend = currentUsage.trend;
  const previousTrend = previousUsage.trend;
  const toolRows = currentUsage.tools;

  const subscriptions: SubscriptionCycleSource[] = filterCycleCodingSubscriptions(subscriptionPlans, isCodingTool).map((plan) => ({
    id: plan.id,
    name: plan.name,
    toolKey: plan.toolKey,
    toolName: plan.toolName,
    usageToolNames: toolUsageNames(plan.toolKey ?? plan.toolName),
    billingCadence: plan.billingCadence,
    billingCycleAnchorDate: plan.billingCycleAnchorDate,
    billingCycleDays: plan.billingCycleDays,
    cycleSeatMicros: plan.cycleSeatMicros,
    seatCount: plan.seatCapacity,
    startDate: plan.createdAt,
    endDate: null as Date | null,
  }));

  const subscriptionSlices = buildSubscriptionSlices({
    subscriptions,
    view: cycleView,
    now: context.now,
    last30: { from: dates.from, toExclusive: dates.toExclusive },
  });
  const allocatedUsage = await readAllocatedCycleUsage(orgId, subscriptionSlices, cycleView);
  const cycleCommitment = subscriptionSlices.reduce(
    (sum, slice) => sum + microsToDollars(slice.spendMicros),
    0,
  );

  const daysWithActivity = currentTrend.filter((row) => row.modelCalls > 0).length;
  const firstActivityDate = currentTrend.find((row) => row.modelCalls > 0)?.date ?? null;
  const observation = observationCoverage({
    rangeDays: range,
    daysWithActivity,
    firstActivityDate,
    from: dates.from,
  });
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
    cycleView,
    period: {
      from: dates.from.toISOString(),
      to: dates.to.toISOString(),
      previousFrom: dates.previousFrom.toISOString(),
      previousTo: dates.previousTo.toISOString(),
    },
    hasActivity:
      usageKpis.modelCalls > 0 ||
      mergedTools.some((tool) => tool.requests > 0) ||
      detectedInstallations.length > 0,
    partialData: previousKpis.partialData,
    observation,
    kpis: {
      actualSpend: {
        value: cycleCommitment,
        previousValue: 0,
        deltaPercent: null,
        basis: subscriptionSlices.length ? "subscriptions" : "none",
      },
      // Usage KPIs use the same report-window org totals as the chart/tools list,
      // not subscription-cycle allocation (which is $0 when no plans are configured).
      verifiedUsageCost: {
        value: usageKpis.verifiedUsageCost,
        previousValue: previousKpis.verifiedUsageCost,
        deltaPercent: null,
      },
      estimatedApiCost: {
        value: usageKpis.estimatedApiCost,
        previousValue: previousKpis.estimatedApiCost,
        deltaPercent: null,
      },
      modelCalls: {
        value: usageKpis.modelCalls,
        previousValue: previousKpis.modelCalls,
        deltaPercent: null,
      },
    },
    subscriptionCycles: filterActiveSubscriptionCycles(
      enrichSubscriptionCyclesWithUtilization(
        rollupSubscriptionCyclesByTool(
          subscriptionSlices.map((slice) => {
            const usage = allocatedUsage.get(slice.id);
            return {
              id: slice.id,
              subscriptionId: slice.subscriptionId,
              name: slice.name,
              toolName: slice.toolName,
              toolKey: slice.toolKey,
              cycleSpend: microsToDollars(slice.spendMicros),
              verifiedUsageCost: usage?.verifiedUsageCost ?? 0,
              estimatedApiCost: usage?.estimatedApiCost ?? 0,
              modelCalls: usage?.modelCalls ?? 0,
              windowFrom: isoDay(slice.windowFrom),
              windowTo: isoDay(slice.windowTo),
              billingCycle: cycleToJson(slice.cycle),
            };
          }),
        ),
        planUsage.data.subscriptions,
      ),
    ),
    renewals: rollupSubscriptionCyclesByTool(
      subscriptionSlices.map((slice) => ({
        id: slice.id,
        subscriptionId: slice.subscriptionId,
        name: slice.name,
        toolName: slice.toolName,
        toolKey: slice.toolKey,
        cycleSpend: microsToDollars(slice.spendMicros),
        verifiedUsageCost: 0,
        estimatedApiCost: 0,
        modelCalls: 0,
        windowFrom: isoDay(slice.windowFrom),
        windowTo: isoDay(slice.windowTo),
        billingCycle: cycleToJson(slice.cycle),
      })),
    )
      .map((row) => ({
        id: row.id,
        toolName: row.toolName,
        toolKey: row.toolKey,
        planNames: row.planNames,
        planCount: row.planCount,
        nextRenewalDate: row.billingCycle.nextRenewalDate,
        remainingDays: row.billingCycle.remainingDays,
        elapsedPercent: row.billingCycle.elapsedPercent,
      }))
      .sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate)),
    trend: fillTrend(range, dates.from, currentTrend, previousTrend),
    attention,
    tools: mergedTools,
    coverage: {
      developers: totalDevelopers,
      activeDevelopers: metricNumber(activeUsage.data.rows[0], "activeDevelopers"),
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
  };

  return makeInsightEnvelope({
    context,
    kind: "overview",
    window: reportWindow,
    dataThrough: currentUsage.dataThrough,
    data,
  });
}

export function overviewInputFromRange(
  range: number,
  now: Date = new Date(),
  cycleView: CycleView = "current_cycles",
): OverviewInput {
  const days = Math.max(1, Math.min(366, Math.round(range)));
  const dates = usageWindowDays(days, now);
  return {
    range: days,
    cycleView,
    reportWindow: toMetricWindow(dates.from, dates.to),
    previousWindow: toMetricWindow(dates.previousFrom, dates.previousTo),
  };
}

export function overviewInputFromBounds(
  from: Date | string,
  to: Date | string,
  cycleView: CycleView = "current_cycles",
): OverviewInput {
  const start = utcDateOnly(typeof from === "string" ? new Date(`${from}T00:00:00Z`) : from);
  const end = usageInclusiveEnd(typeof to === "string" ? new Date(`${to}T00:00:00Z`) : to);
  const days = inclusiveDayCount(start, end);
  const previousTo = new Date(start.getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY_MS);
  return {
    range: days,
    cycleView,
    reportWindow: toMetricWindow(start, end),
    previousWindow: toMetricWindow(previousFrom, previousTo),
  };
}
