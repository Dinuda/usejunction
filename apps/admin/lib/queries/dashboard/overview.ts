import { prisma } from "@usejunction/db";
import { getDashboardConfigHealth } from "@/lib/queries/dashboard/config-health";

export type DashboardRange = 7 | 30 | 90;

type MetricWindow = {
  requests: number;
  cost: number;
  successful: number;
  activeDevelopers: number;
};

export interface DashboardOverviewData {
  range: DashboardRange;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  hasActivity: boolean;
  kpis: {
    spend: { value: number; previousValue: number; deltaPercent: number | null };
    requests: { value: number; previousValue: number; deltaPercent: number | null };
    activeDevelopers: { value: number; previousValue: number; deltaPercent: number | null };
    successRate: { value: number; previousValue: number; deltaPercent: number | null };
  };
  trend: Array<{ date: string; requests: number; cost: number; previousRequests: number; previousCost: number }>;
  attention: Array<{ id: string; severity: "warning" | "error"; title: string; detail: string; href: string }>;
  tools: Array<{ name: string; requests: number; cost: number; activeDevelopers: number }>;
  coverage: { developers: number; activeDevelopers: number; devices: number; onlineDevices: number; configuredTools: number; trackedTools: number };
  failures: Array<{ id: string; createdAt: string; developer: string; tool: string; model: string; latencyMs: number; status: string }>;
}

type RawMetric = { requests: number; cost: number; successful: number; activeDevelopers: number };
type RawTrend = { day: Date; requests: number; cost: number };
type RawTool = { name: string | null; requests: number; cost: number; activeDevelopers: number };
type RawFailure = { id: string; createdAt: Date; developer: string | null; toolName: string | null; model: string | null; latencyMs: number; status: string };

function windowDates(range: DashboardRange) {
  const to = new Date();
  const from = new Date(to.getTime() - range * 86_400_000);
  const previousTo = from;
  const previousFrom = new Date(previousTo.getTime() - range * 86_400_000);
  return { from, to, previousFrom, previousTo };
}

function normalizeMetric(row: RawMetric | undefined): MetricWindow {
  return {
    requests: Number(row?.requests ?? 0),
    cost: Number(row?.cost ?? 0),
    successful: Number(row?.successful ?? 0),
    activeDevelopers: Number(row?.activeDevelopers ?? 0),
  };
}

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

function rate(metric: MetricWindow) {
  return metric.requests === 0 ? 100 : (metric.successful / metric.requests) * 100;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fillTrend(range: DashboardRange, from: Date, rows: RawTrend[], previousRows: RawTrend[]) {
  const current = new Map(rows.map((row) => [isoDay(new Date(row.day)), row]));
  const previous = new Map(previousRows.map((row) => [isoDay(new Date(row.day)), row]));
  return Array.from({ length: range }, (_, index) => {
    const day = new Date(from.getTime() + index * 86_400_000);
    const previousDay = new Date(day.getTime() - range * 86_400_000);
    const row = current.get(isoDay(day));
    const previousRow = previous.get(isoDay(previousDay));
    return {
      date: isoDay(day),
      requests: Number(row?.requests ?? 0),
      cost: Number(row?.cost ?? 0),
      previousRequests: Number(previousRow?.requests ?? 0),
      previousCost: Number(previousRow?.cost ?? 0),
    };
  });
}

export async function getDashboardOverview(orgId: string, range: DashboardRange = 30): Promise<DashboardOverviewData> {
  const dates = windowDates(range);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);

  const [currentRows, previousRows, trendRows, previousTrendRows, toolRows, failures, totalDevelopers, totalDevices, onlineDevices, configuredTools, trackedTools, health] = await Promise.all([
    prisma.$queryRaw<RawMetric[]>`
      SELECT COUNT(*)::int AS requests,
             COALESCE(SUM(estimated_cost), 0)::float AS cost,
             COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
             COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS "activeDevelopers"
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${dates.from} AND created_at < ${dates.to}
    `,
    prisma.$queryRaw<RawMetric[]>`
      SELECT COUNT(*)::int AS requests,
             COALESCE(SUM(estimated_cost), 0)::float AS cost,
             COUNT(*) FILTER (WHERE status = 'success')::int AS successful,
             COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS "activeDevelopers"
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${dates.previousFrom} AND created_at < ${dates.previousTo}
    `,
    prisma.$queryRaw<RawTrend[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS requests,
             COALESCE(SUM(estimated_cost), 0)::float AS cost
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${dates.from} AND created_at < ${dates.to}
      GROUP BY 1 ORDER BY 1 ASC
    `,
    prisma.$queryRaw<RawTrend[]>`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS requests,
             COALESCE(SUM(estimated_cost), 0)::float AS cost
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${dates.previousFrom} AND created_at < ${dates.previousTo}
      GROUP BY 1 ORDER BY 1 ASC
    `,
    prisma.$queryRaw<RawTool[]>`
      SELECT COALESCE(tool_name, 'Unknown') AS name, COUNT(*)::int AS requests,
             COALESCE(SUM(estimated_cost), 0)::float AS cost,
             COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS "activeDevelopers"
      FROM request_metadata
      WHERE org_id = ${orgId} AND created_at >= ${dates.from} AND created_at < ${dates.to}
      GROUP BY 1 ORDER BY requests DESC LIMIT 6
    `,
    prisma.$queryRaw<RawFailure[]>`
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
    prisma.toolInstallation.count({ where: { orgId, configured: true } }),
    prisma.toolInstallation.count({ where: { orgId } }),
    getDashboardConfigHealth(orgId),
  ]);

  const current = normalizeMetric(currentRows[0]);
  const previous = normalizeMetric(previousRows[0]);
  const attention: DashboardOverviewData["attention"] = [];

  const offlineDevices = await prisma.device.findMany({
    where: { orgId, lastSeenAt: { lt: fiveMinutesAgo } },
    orderBy: { lastSeenAt: "asc" },
    take: 3,
    select: { id: true, hostname: true, lastSeenAt: true },
  });
  offlineDevices.forEach((device) => attention.push({
    id: `device-${device.id}`,
    severity: "warning",
    title: `${device.hostname} is offline`,
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
    period: { from: dates.from.toISOString(), to: dates.to.toISOString(), previousFrom: dates.previousFrom.toISOString(), previousTo: dates.previousTo.toISOString() },
    hasActivity: current.requests > 0,
    kpis: {
      spend: { value: current.cost, previousValue: previous.cost, deltaPercent: delta(current.cost, previous.cost) },
      requests: { value: current.requests, previousValue: previous.requests, deltaPercent: delta(current.requests, previous.requests) },
      activeDevelopers: { value: current.activeDevelopers, previousValue: previous.activeDevelopers, deltaPercent: delta(current.activeDevelopers, previous.activeDevelopers) },
      successRate: { value: rate(current), previousValue: rate(previous), deltaPercent: delta(rate(current), rate(previous)) },
    },
    trend: fillTrend(range, dates.from, trendRows, previousTrendRows),
    attention: attention.slice(0, 5),
    tools: toolRows.map((tool) => ({ name: tool.name ?? "Unknown", requests: Number(tool.requests), cost: Number(tool.cost), activeDevelopers: Number(tool.activeDevelopers) })),
    coverage: { developers: totalDevelopers, activeDevelopers: current.activeDevelopers, devices: totalDevices, onlineDevices, configuredTools, trackedTools },
    failures: failures.map((failure) => ({ id: failure.id, createdAt: new Date(failure.createdAt).toISOString(), developer: failure.developer ?? "Unknown developer", tool: failure.toolName ?? "Unknown tool", model: failure.model ?? "Unknown model", latencyMs: Number(failure.latencyMs), status: failure.status })),
  };
}
