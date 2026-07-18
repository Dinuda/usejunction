import { prisma } from "@usejunction/db";
import { usageExclusiveEnd, utcDateOnly } from "@/lib/metrics/date-range";
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
