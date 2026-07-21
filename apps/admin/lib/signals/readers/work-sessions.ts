import { Prisma, prisma } from "@usejunction/db";
import { usageExclusiveEnd, utcDateOnly } from "@/lib/metrics/date-range";
import { startOfUtcDay } from "@/lib/signals/policies/aggregates";
import type { SignalsTrendPoint } from "@/lib/signals/contracts/shared";
import { interleaveByTool, parseWorkTrace, type WorkTrace } from "@/lib/signals/work-trace";

/** Soft cap for overview aggregation — matches classic Signals session reads. */
export const WORK_SESSION_READ_CAP = 2000;

export type WorkSessionRow = {
  id: string;
  toolName: string;
  model: string | null;
  mode: string | null;
  title: string | null;
  tldr: string | null;
  overview: string | null;
  observedAt: Date;
  source: string;
  toolCallCounts: unknown;
  trace: WorkTrace | null;
  developerId: string;
  developer: { name: string; email: string };
};

type WorkSessionWindowOpts = {
  from: Date;
  to: Date;
  developerId?: string;
  teamId?: string;
  tool?: string;
  take?: number;
  /** When true, round-robin across tools so one source cannot bury another. */
  interleave?: boolean;
};

function workSessionWhere(orgId: string, opts: WorkSessionWindowOpts) {
  // `to` is an inclusive calendar day (UTC midnight). DateTime observedAt needs
  // an exclusive bound at the next midnight or today's sessions are dropped —
  // same pattern as readSignalsSessionsWindow.
  return {
    orgId,
    observedAt: {
      gte: utcDateOnly(opts.from),
      lt: usageExclusiveEnd(opts.to),
    },
    ...(opts.developerId ? { developerId: opts.developerId } : {}),
    ...(opts.tool ? { toolName: opts.tool } : {}),
    ...(opts.teamId ? { developer: { teamId: opts.teamId } } : {}),
  };
}

function workSessionSqlFilters(orgId: string, opts: WorkSessionWindowOpts) {
  const from = utcDateOnly(opts.from);
  const toExclusive = usageExclusiveEnd(opts.to);
  const filters: Prisma.Sql[] = [
    Prisma.sql`lws.org_id = ${orgId}`,
    Prisma.sql`lws.observed_at >= ${from}`,
    Prisma.sql`lws.observed_at < ${toExclusive}`,
  ];
  if (opts.developerId) filters.push(Prisma.sql`lws.developer_id = ${opts.developerId}`);
  if (opts.tool) filters.push(Prisma.sql`lws.tool_name = ${opts.tool}`);
  if (opts.teamId) filters.push(Prisma.sql`d.team_id = ${opts.teamId}`);
  return Prisma.join(filters, " AND ");
}

/** Full-window read for KPIs / daily trend (not the interleaved activity preview). */
export async function readLocalWorkSessionsWindow(
  orgId: string,
  opts: WorkSessionWindowOpts,
): Promise<WorkSessionRow[]> {
  const take = Math.min(Math.max(opts.take ?? WORK_SESSION_READ_CAP, 1), WORK_SESSION_READ_CAP);
  const rows = await prisma.localWorkSession.findMany({
    where: workSessionWhere(orgId, opts),
    orderBy: { observedAt: "desc" },
    take,
    select: {
      id: true,
      toolName: true,
      model: true,
      mode: true,
      title: true,
      tldr: true,
      overview: true,
      observedAt: true,
      source: true,
      toolCallCounts: true,
      trace: true,
      developerId: true,
      developer: { select: { name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    ...row,
    trace: parseWorkTrace(row.trace),
  }));
}

export async function readLocalWorkSessions(
  orgId: string,
  opts: WorkSessionWindowOpts,
): Promise<WorkSessionRow[]> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const interleave = opts.interleave === true && !opts.tool;
  const fetchTake = interleave ? Math.min(Math.max(take * 3, take), 200) : take;

  const rows = await prisma.localWorkSession.findMany({
    where: workSessionWhere(orgId, opts),
    orderBy: { observedAt: "desc" },
    take: fetchTake,
    select: {
      id: true,
      toolName: true,
      model: true,
      mode: true,
      title: true,
      tldr: true,
      overview: true,
      observedAt: true,
      source: true,
      toolCallCounts: true,
      trace: true,
      developerId: true,
      developer: { select: { name: true, email: true } },
    },
  });

  const mapped = rows.map((row) => ({
    ...row,
    trace: parseWorkTrace(row.trace),
  }));

  if (!interleave) return mapped.slice(0, take);
  return interleaveByTool(mapped, { perTool: Math.ceil(take / 2), take });
}

export type WorkSessionOverviewAggregates = {
  sessions: number;
  activePeople: number;
  models: number;
  dataThrough: Date | null;
  trend: SignalsTrendPoint[];
  topTools: Array<{ tool: string; sessions: number; people: number }>;
};

function fillDailyTrend(
  rows: Array<{ date: string; sessions: number; people: number }>,
  window: { from: Date; to: Date },
): SignalsTrendPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), window.from.getUTCDate()));
  const end = new Date(Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()));
  let guard = 0;
  while (cursor <= end && guard < 400) {
    keys.push(startOfUtcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return keys.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      sessions: row?.sessions ?? 0,
      people: row?.people ?? 0,
      durationSeconds: 0,
    };
  });
}

function toCount(value: bigint | number | null | undefined) {
  return Number(value ?? 0);
}

type KpiRow = {
  sessions: bigint | number;
  active_people: bigint | number;
  models: bigint | number;
  data_through: Date | null;
};

type TrendRow = { date: string; sessions: bigint | number; people: bigint | number };
type ToolRow = { tool: string; sessions: bigint | number; people: bigint | number };

/** SQL aggregates for Signals overview KPIs — avoids pulling full session/trace rows. */
export async function readLocalWorkSessionOverviewAggregates(
  orgId: string,
  opts: WorkSessionWindowOpts,
): Promise<WorkSessionOverviewAggregates> {
  const whereSql = workSessionSqlFilters(orgId, opts);
  const joinDevelopers = Boolean(opts.teamId);

  const kpiQuery = joinDevelopers
    ? prisma.$queryRaw<KpiRow[]>`
        SELECT
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS active_people,
          COUNT(DISTINCT lws.model) FILTER (WHERE lws.model IS NOT NULL)::bigint AS models,
          MAX(lws.observed_at) AS data_through
        FROM local_work_sessions lws
        INNER JOIN users d ON d.id = lws.developer_id
        WHERE ${whereSql}
      `
    : prisma.$queryRaw<KpiRow[]>`
        SELECT
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS active_people,
          COUNT(DISTINCT lws.model) FILTER (WHERE lws.model IS NOT NULL)::bigint AS models,
          MAX(lws.observed_at) AS data_through
        FROM local_work_sessions lws
        WHERE ${whereSql}
      `;

  const trendQuery = joinDevelopers
    ? prisma.$queryRaw<TrendRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', lws.observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS people
        FROM local_work_sessions lws
        INNER JOIN users d ON d.id = lws.developer_id
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY 1 ASC
      `
    : prisma.$queryRaw<TrendRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', lws.observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS people
        FROM local_work_sessions lws
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY 1 ASC
      `;

  const toolsQuery = joinDevelopers
    ? prisma.$queryRaw<ToolRow[]>`
        SELECT
          lws.tool_name AS tool,
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS people
        FROM local_work_sessions lws
        INNER JOIN users d ON d.id = lws.developer_id
        WHERE ${whereSql}
        GROUP BY lws.tool_name
        ORDER BY COUNT(*) DESC, lws.tool_name ASC
        LIMIT 10
      `
    : prisma.$queryRaw<ToolRow[]>`
        SELECT
          lws.tool_name AS tool,
          COUNT(*)::bigint AS sessions,
          COUNT(DISTINCT lws.developer_id)::bigint AS people
        FROM local_work_sessions lws
        WHERE ${whereSql}
        GROUP BY lws.tool_name
        ORDER BY COUNT(*) DESC, lws.tool_name ASC
        LIMIT 10
      `;

  const [kpiRows, trendRows, toolRows] = await Promise.all([kpiQuery, trendQuery, toolsQuery]);

  const kpi = kpiRows[0] ?? { sessions: 0, active_people: 0, models: 0, data_through: null };

  return {
    sessions: toCount(kpi.sessions),
    activePeople: toCount(kpi.active_people),
    models: toCount(kpi.models),
    dataThrough: kpi.data_through,
    trend: fillDailyTrend(
      trendRows.map((row) => ({
        date: row.date,
        sessions: toCount(row.sessions),
        people: toCount(row.people),
      })),
      { from: opts.from, to: opts.to },
    ),
    topTools: toolRows.map((row) => ({
      tool: row.tool,
      sessions: toCount(row.sessions),
      people: toCount(row.people),
    })),
  };
}

/** Recent work sessions for overview teaser — own query, capped take (keeps trace for list UI). */
export async function readLocalWorkSessionsRecent(
  orgId: string,
  opts: WorkSessionWindowOpts,
  take = 12,
): Promise<WorkSessionRow[]> {
  const limit = Math.min(Math.max(take, 1), 50);
  const rows = await prisma.localWorkSession.findMany({
    where: workSessionWhere(orgId, opts),
    orderBy: { observedAt: "desc" },
    take: limit,
    select: {
      id: true,
      toolName: true,
      model: true,
      mode: true,
      title: true,
      tldr: true,
      overview: true,
      observedAt: true,
      source: true,
      toolCallCounts: true,
      trace: true,
      developerId: true,
      developer: { select: { name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    ...row,
    trace: parseWorkTrace(row.trace),
  }));
}

/** Exported for unit tests — fills empty UTC days in a window. */
export function fillWorkOverviewTrendForTests(
  rows: Array<{ date: string; sessions: number; people: number }>,
  window: { from: Date; to: Date },
): SignalsTrendPoint[] {
  return fillDailyTrend(rows, window);
}
