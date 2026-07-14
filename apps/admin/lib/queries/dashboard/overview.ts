import { prisma } from "@usejunction/db";
import { DAY_MS, inclusiveDayCount, usageWindowDays, utcDateOnly } from "@/lib/metrics/date-range";
import { aggregateUsageKpis, fetchUsageRows, groupByDay, groupByTool } from "@/lib/metrics/model-usage";
import { getDashboardConfigHealth, formatUserDeviceContext } from "@/lib/queries/dashboard/config-health";

export type DashboardRange = 7 | 30 | 90;

export const ACTIVE_PEOPLE_WINDOW_DAYS = 7;

export interface DashboardOverviewData {
  range: DashboardRange;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  hasActivity: boolean;
  partialData: boolean;
  kpis: {
    actualSpend: { value: number; previousValue: number; deltaPercent: number | null };
    verifiedUsageCost: { value: number; previousValue: number; deltaPercent: number | null };
    estimatedApiCost: { value: number; previousValue: number; deltaPercent: number | null };
    modelCalls: { value: number; previousValue: number; deltaPercent: number | null };
    activeDevelopers: { value: number; previousValue: number; deltaPercent: number | null };
  };
  trend: Array<{ date: string; requests: number; cost: number; previousRequests: number; previousCost: number }>;
  attention: Array<{ id: string; severity: "warning" | "error"; title: string; detail: string; href: string }>;
  tools: Array<{ name: string; requests: number; cost: number; activeDevelopers: number }>;
  coverage: { developers: number; activeDevelopers: number; devices: number; onlineDevices: number; configuredTools: number; trackedTools: number };
  failures: Array<{ id: string; createdAt: string; developer: string; tool: string; model: string; latencyMs: number; status: string }>;
}

function windowDates(range: DashboardRange) {
  return usageWindowDays(range);
}

function activePeopleDates() {
  return usageWindowDays(ACTIVE_PEOPLE_WINDOW_DAYS);
}

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fillTrend(
  range: DashboardRange,
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

type BillingPlanRow = { monthlySeatMicros: bigint; seatCapacity: number };

function planSubscriptionSpend(plans: BillingPlanRow[], from: Date, to: Date) {
  const periodDays = inclusiveDayCount(from, to);
  const micros = plans.reduce((sum, plan) => {
    const monthlyMicros = plan.monthlySeatMicros * BigInt(plan.seatCapacity);
    return sum + (monthlyMicros * BigInt(periodDays)) / BigInt(30);
  }, BigInt(0));
  return Number(micros) / 1_000_000;
}

export async function getDashboardOverview(orgId: string, range: DashboardRange = 30): Promise<DashboardOverviewData> {
  const dates = windowDates(range);
  const activeDates = activePeopleDates();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);

  const [
    currentRows,
    previousRows,
    activeObservedCurrent,
    activeObservedPrevious,
    failures,
    totalDevelopers,
    totalDevices,
    onlineDevices,
    configuredTools,
    trackedTools,
    health,
    detectedInstallations,
    subscriptionPlans,
  ] = await Promise.all([
    fetchUsageRows({ orgId, from: dates.from, to: dates.to }),
    fetchUsageRows({ orgId, from: dates.previousFrom, to: dates.previousTo }),
    prisma.$queryRaw<Array<{ activeDevelopers: number }>>`
      SELECT COUNT(DISTINCT developer_id) FILTER (WHERE developer_id IS NOT NULL)::int AS "activeDevelopers"
      FROM usage_daily
      WHERE org_id = ${orgId} AND date >= ${activeDates.from} AND date <= ${activeDates.to}
        AND metric_kind <> 'productivity' AND requests > 0
    `,
    prisma.$queryRaw<Array<{ activeDevelopers: number }>>`
      SELECT COUNT(DISTINCT developer_id) FILTER (WHERE developer_id IS NOT NULL)::int AS "activeDevelopers"
      FROM usage_daily
      WHERE org_id = ${orgId} AND date >= ${activeDates.previousFrom} AND date <= ${activeDates.previousTo}
        AND metric_kind <> 'productivity' AND requests > 0
    `,
    prisma.$queryRaw<Array<{ id: string; createdAt: Date; developer: string | null; toolName: string | null; model: string | null; latencyMs: number; status: string }>>`
      SELECT r.id, r.created_at AS "createdAt", d.name AS developer,
             r.tool_name AS "toolName", r.model, r.latency_ms AS "latencyMs", r.status
      FROM request_metadata r
      LEFT JOIN users d ON d.id = r.user_id
      WHERE r.org_id = ${orgId} AND r.created_at >= ${dates.from} AND r.created_at < ${dates.to}
        AND r.status <> 'success'
      ORDER BY r.created_at DESC LIMIT 5
    `,
    prisma.developer.count({ where: { orgId } }),
    prisma.device.count({ where: { orgId } }),
    prisma.device.count({ where: { orgId, lastSeenAt: { gte: fiveMinutesAgo } } }),
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
      select: { monthlySeatMicros: true, seatCapacity: true },
    }),
  ]);

  const currentKpis = aggregateUsageKpis(currentRows);
  const previousKpis = aggregateUsageKpis(previousRows);
  const currentTrend = groupByDay(currentRows);
  const previousTrend = groupByDay(previousRows);
  const toolRows = groupByTool(currentRows);
  const actualSpend = planSubscriptionSpend(subscriptionPlans, dates.from, dates.to);
  const previousActualSpend = planSubscriptionSpend(subscriptionPlans, dates.previousFrom, dates.previousTo);

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

  const attention: DashboardOverviewData["attention"] = [];
  const offlineDevices = await prisma.device.findMany({
    where: { orgId, lastSeenAt: { lt: fiveMinutesAgo } },
    orderBy: { lastSeenAt: "asc" },
    take: 3,
    select: { id: true, hostname: true, lastSeenAt: true, user: { select: { name: true } } },
  });
  offlineDevices.forEach((device) => attention.push({
    id: `device-${device.id}`,
    severity: "warning",
    title: `${formatUserDeviceContext(device.user, device)} is offline`,
    detail: `Last seen ${device.lastSeenAt.toLocaleString()}`,
    href: "/team",
  }));
  health.issues.slice(0, 4).forEach((issue, index) => attention.push({
    id: `health-${index}`,
    severity: issue.severity,
    title: issue.message,
    detail: issue.context,
    href: "/tools",
  }));

  return {
    range,
    period: {
      from: dates.from.toISOString(),
      to: dates.to.toISOString(),
      previousFrom: dates.previousFrom.toISOString(),
      previousTo: dates.previousTo.toISOString(),
    },
    hasActivity: currentKpis.modelCalls > 0 || mergedTools.some((tool) => tool.requests > 0) || detectedInstallations.length > 0,
    partialData: currentKpis.partialData || previousKpis.partialData,
    kpis: {
      actualSpend: {
        value: actualSpend,
        previousValue: previousActualSpend,
        deltaPercent: delta(actualSpend, previousActualSpend),
      },
      verifiedUsageCost: {
        value: currentKpis.verifiedUsageCost,
        previousValue: previousKpis.verifiedUsageCost,
        deltaPercent: delta(currentKpis.verifiedUsageCost, previousKpis.verifiedUsageCost),
      },
      estimatedApiCost: {
        value: currentKpis.estimatedApiCost,
        previousValue: previousKpis.estimatedApiCost,
        deltaPercent: delta(currentKpis.estimatedApiCost, previousKpis.estimatedApiCost),
      },
      modelCalls: {
        value: currentKpis.modelCalls,
        previousValue: previousKpis.modelCalls,
        deltaPercent: delta(currentKpis.modelCalls, previousKpis.modelCalls),
      },
      activeDevelopers: {
        value: Number(activeObservedCurrent[0]?.activeDevelopers ?? 0),
        previousValue: Number(activeObservedPrevious[0]?.activeDevelopers ?? 0),
        deltaPercent: delta(
          Number(activeObservedCurrent[0]?.activeDevelopers ?? 0),
          Number(activeObservedPrevious[0]?.activeDevelopers ?? 0),
        ),
      },
    },
    trend: fillTrend(range, dates.from, currentTrend, previousTrend),
    attention: attention.slice(0, 5),
    tools: mergedTools,
    coverage: {
      developers: totalDevelopers,
      activeDevelopers: Number(activeObservedCurrent[0]?.activeDevelopers ?? 0),
      devices: totalDevices,
      onlineDevices,
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
}
