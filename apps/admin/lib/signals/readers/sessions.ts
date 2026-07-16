import { prisma } from "@usejunction/db";
import { usageExclusiveEnd, utcDateOnly } from "@/lib/metrics/date-range";
import type { SignalsFiltersInput } from "@/lib/signals/contracts/shared";
import { parseFlowKey, sessionMatchesFlowKey } from "@/lib/signals/policies/flow";

/** Soft cap for v1 in-memory aggregation. Documented; SQL group-by is a follow-up. */
export const SIGNALS_SESSION_READ_CAP = 2000;

export type SignalsSessionRow = {
  id: string;
  aiTool: string;
  appBefore: string | null;
  domainBefore: string | null;
  appAfter: string | null;
  domainAfter: string | null;
  flowSignature: string;
  startedAt: Date;
  durationSeconds: number;
  confidence: number;
  developerId: string;
  steps: unknown;
  developer: { name: string; email: string };
};

export type SignalsSessionWindowFilters = SignalsFiltersInput & {
  from: Date;
  to: Date;
  take?: number;
};

function sessionWhere(orgId: string, filters: SignalsSessionWindowFilters) {
  // `to` is an inclusive calendar day (UTC midnight). DateTime sessions need
  // an exclusive bound at the next midnight or today's sessions are dropped.
  return {
    orgId,
    startedAt: {
      gte: utcDateOnly(filters.from),
      lt: usageExclusiveEnd(filters.to),
    },
    ...(filters.developerId ? { developerId: filters.developerId } : {}),
    ...(filters.tool ? { aiTool: filters.tool } : {}),
    ...(filters.teamId ? { developer: { teamId: filters.teamId } } : {}),
  };
}

export async function readSignalsSessionsWindow(
  orgId: string,
  filters: SignalsSessionWindowFilters,
): Promise<SignalsSessionRow[]> {
  return prisma.signalsSession.findMany({
    where: sessionWhere(orgId, filters),
    orderBy: { startedAt: "desc" },
    take: filters.take ?? SIGNALS_SESSION_READ_CAP,
    select: {
      id: true,
      aiTool: true,
      appBefore: true,
      domainBefore: true,
      appAfter: true,
      domainAfter: true,
      flowSignature: true,
      startedAt: true,
      durationSeconds: true,
      confidence: true,
      developerId: true,
      steps: true,
      developer: { select: { name: true, email: true } },
    },
  });
}

export async function readSignalsSessionSteps(
  orgId: string,
  flowKey: string,
  filters: SignalsSessionWindowFilters,
): Promise<SignalsSessionRow[]> {
  const parts = parseFlowKey(flowKey);
  if (!parts) return [];

  const sessions = await readSignalsSessionsWindow(orgId, {
    ...filters,
    tool: filters.tool ?? parts.aiTool,
  });
  return sessions.filter((session) => sessionMatchesFlowKey(session, flowKey));
}
