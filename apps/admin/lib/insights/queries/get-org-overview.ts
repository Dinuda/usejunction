import { prisma } from "@usejunction/db";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  ensureOrgUsageDaySnapshots,
  readOrgUsageFromSnapshots,
  type SnapshotToolDay,
} from "@/lib/analytics/snapshots";
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
import { reportWindowForCycleOffset } from "@/lib/dashboard/cycle-view";
import { isCodingTool, toolDisplayName, toolUsageNames } from "@/lib/tools/catalog";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { fillOverviewTrend } from "@/lib/insights/policies/overview-trend";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMetricWindow(from: Date, to: Date): MetricWindow {
  return { from, to, timezone: UTC_TIMEZONE, grain: "day" };
}

async function readOverviewUsage(
  orgId: string,
  window: MetricWindow,
  includeTools: boolean,
  filters: { toolNames?: string[]; ensure?: boolean } = {},
) {
  const snapshot = await readOrgUsageFromSnapshots(orgId, window, {
    includeTools,
    toolNames: filters.toolNames,
    ensure: filters.ensure,
  });
  return {
    dataThrough: snapshot.dataThrough,
    kpis: snapshot.kpis,
    trend: snapshot.trend,
    tools: snapshot.tools.map((tool) => ({
      toolName: tool.toolName || "unknown",
      modelCalls: tool.requests,
      cost: tool.cost,
      activeDevelopers: tool.activeDevelopers,
    })),
    activeDevelopers: snapshot.activeDevelopers,
    toolDays: snapshot.toolDays,
  };
}

type CycleView = OverviewInput["cycleView"];

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

async function readAllocatedCycleUsage(
  slices: SubscriptionSlice[],
  view: CycleView,
  toolDays: SnapshotToolDay[],
) {
  const usageBySlice = new Map<string, { modelCalls: number; verifiedUsageCost: number; estimatedApiCost: number }>();
  for (const slice of slices) {
    usageBySlice.set(slice.id, { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 });
  }

  const toolNameSet = (names: string[]) => new Set(names);

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
    for (const group of groups.values()) {
      const names = toolNameSet(group.toolNames);
      const fromKey = isoDay(group.from);
      const toKey = isoDay(group.to);
      let modelCalls = 0;
      let verifiedUsageCost = 0;
      let estimatedApiCost = 0;
      for (const day of toolDays) {
        if (!names.has(day.toolName)) continue;
        if (day.date < fromKey || day.date > toKey) continue;
        modelCalls += day.requests;
        verifiedUsageCost += day.verifiedUsageCost;
        estimatedApiCost += day.estimatedApiCost;
      }
      for (const slice of group.slices) {
        const share = Math.max(1, slice.seatCount) / Math.max(1, group.totalSeats);
        usageBySlice.set(slice.id, {
          modelCalls: modelCalls * share,
          verifiedUsageCost: verifiedUsageCost * share,
          estimatedApiCost: estimatedApiCost * share,
        });
      }
    }
    return usageBySlice;
  }

  const groups = new Map<string, { toolNames: string[]; slices: SubscriptionSlice[] }>();
  for (const slice of slices) {
    const key = usageToolKey(slice.usageToolNames);
    const group = groups.get(key) ?? { toolNames: slice.usageToolNames, slices: [] };
    group.slices.push(slice);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const names = toolNameSet(group.toolNames);
    const toolSlices = group.slices;
    const daily = new Map<string, { modelCalls: number; verifiedUsageCost: number; estimatedApiCost: number }>();
    for (const day of toolDays) {
      if (!names.has(day.toolName)) continue;
      const existing = daily.get(day.date) ?? { modelCalls: 0, verifiedUsageCost: 0, estimatedApiCost: 0 };
      existing.modelCalls += day.requests;
      existing.verifiedUsageCost += day.verifiedUsageCost;
      existing.estimatedApiCost += day.estimatedApiCost;
      daily.set(day.date, existing);
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
  }
  return usageBySlice;
}

export async function getOrgOverview(
  context: InsightContext,
  input: OverviewInput,
): Promise<InsightEnvelope<OrgOverviewV1>> {
  assertInsightRoles(context, ["owner", "admin"]);

  const orgId = context.orgId;
  const cycleView: CycleView = input.cycleView;

  // Load plans first so current/previous cycle views can align KPI/chart windows
  // to billing cycles (same behavior as team/tools/signals).
  // Load the subscription rows once. The same rows are needed to resolve
  // cycle windows and to calculate plan utilization below.
  const subscriptionRows = await listSubscriptions(orgId);
  const subscriptions: SubscriptionCycleSource[] = filterCycleCodingSubscriptions(subscriptionRows, isCodingTool).map((plan) => ({
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

  let reportWindow: MetricWindow;
  let previousWindow: MetricWindow;
  if (input.cycleView === "last_30_days") {
    reportWindow = input.reportWindow;
    previousWindow = input.previousWindow;
  } else {
    const offset = cycleView === "previous_cycles" ? -1 : 0;
    reportWindow = reportWindowForCycleOffset(subscriptions, offset, context.now);
    previousWindow = reportWindowForCycleOffset(subscriptions, offset - 1, context.now);
  }

  const range = inclusiveDayCount(reportWindow.from, reportWindow.to);
  const dates = {
    from: utcDateOnly(reportWindow.from),
    to: usageInclusiveEnd(reportWindow.to),
    toExclusive: usageExclusiveEnd(reportWindow.to),
    previousFrom: utcDateOnly(previousWindow.from),
    previousTo: usageInclusiveEnd(previousWindow.to),
    previousToExclusive: usageExclusiveEnd(previousWindow.to),
  };

  // Seal stubs (and fail-safe rematerialize if snaps were wiped) for the union
  // window once — never two parallel ensures that each touch ~30 days.
  const ensureFrom = new Date(Math.min(reportWindow.from.getTime(), previousWindow.from.getTime()));
  const ensureTo = new Date(Math.max(reportWindow.to.getTime(), previousWindow.to.getTime()));
  await ensureOrgUsageDaySnapshots(orgId, ensureFrom, ensureTo);

  const [
    currentUsage,
    previousUsage,
    failures,
    totalDevelopers,
    deviceCoverage,
    configuredTools,
    trackedTools,
    health,
    detectedInstallations,
    planUsage,
  ] = await Promise.all([
    readOverviewUsage(orgId, reportWindow, true, { ensure: false }),
    readOverviewUsage(orgId, previousWindow, false, { ensure: false }),
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
    readDeviceCoverage(orgId),
    prisma.toolInstallation.count({ where: { orgId, detected: true, configured: true } }),
    prisma.toolInstallation.count({ where: { orgId, detected: true } }),
    getDashboardConfigHealth(orgId),
    prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, detected: true },
      _count: { id: true },
    }),
    getPlanUsage(context, { reportWindow }, { subscriptions: subscriptionRows }),
  ]);

  const previousKpis = previousUsage.kpis;
  const usageKpis = currentUsage.kpis;
  const currentTrend = currentUsage.trend;
  const previousTrend = previousUsage.trend;
  const toolRows = currentUsage.tools;

  const subscriptionSlices = buildSubscriptionSlices({
    subscriptions,
    view: cycleView,
    now: context.now,
    last30: { from: dates.from, toExclusive: dates.toExclusive },
  });

  // Allocation may need tool-day rows outside the report window (billing cycle views).
  let allocationToolDays = currentUsage.toolDays;
  if (subscriptionSlices.length > 0) {
    const allocFrom = new Date(Math.min(
      ...subscriptionSlices.map((slice) => slice.windowFrom.getTime()),
      reportWindow.from.getTime(),
    ));
    const allocTo = new Date(Math.max(
      ...subscriptionSlices.map((slice) => slice.windowTo.getTime()),
      reportWindow.to.getTime(),
    ));
    if (allocFrom.getTime() < reportWindow.from.getTime() || allocTo.getTime() > reportWindow.to.getTime()) {
      await ensureOrgUsageDaySnapshots(orgId, allocFrom, allocTo);
      const expanded = await readOverviewUsage(orgId, toMetricWindow(allocFrom, allocTo), true, { ensure: false });
      allocationToolDays = expanded.toolDays;
    }
  }

  const allocatedUsage = await readAllocatedCycleUsage(subscriptionSlices, cycleView, allocationToolDays);
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
    healthIssues: health.issues,
    planVerdicts: planUsage.data.subscriptions.map((row) => ({
      id: row.planTemplateId,
      name: `${toolDisplayName(row.toolName)} ${row.planName}`,
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
      usageKpis.tokens > 0 ||
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
      tokens: {
        value: usageKpis.tokens,
        previousValue: previousKpis.tokens,
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
        { includeLiveQuota: cycleView !== "previous_cycles" },
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
    trend: fillOverviewTrend(range, dates.from, currentTrend, previousTrend, {
      align: cycleView === "last_30_days" ? "calendar" : "index",
      previousFrom: dates.previousFrom,
    }),
    attention,
    tools: mergedTools,
    coverage: {
      developers: totalDevelopers,
      activeDevelopers: currentUsage.activeDevelopers,
      devices: deviceCoverage.devices,
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
): OverviewInput {
  const days = Math.max(1, Math.min(366, Math.round(range)));
  const dates = usageWindowDays(days, now);
  return {
    cycleView: "last_30_days",
    reportWindow: toMetricWindow(dates.from, dates.to),
    previousWindow: toMetricWindow(dates.previousFrom, dates.previousTo),
  };
}

export function overviewInputFromBounds(
  from: Date | string,
  to: Date | string,
): OverviewInput {
  const start = utcDateOnly(typeof from === "string" ? new Date(`${from}T00:00:00Z`) : from);
  const end = usageInclusiveEnd(typeof to === "string" ? new Date(`${to}T00:00:00Z`) : to);
  const days = inclusiveDayCount(start, end);
  const previousTo = new Date(start.getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY_MS);
  return {
    cycleView: "last_30_days",
    reportWindow: toMetricWindow(start, end),
    previousWindow: toMetricWindow(previousFrom, previousTo),
  };
}
