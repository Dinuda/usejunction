import { prisma } from "@usejunction/db";
import type { SignalsFiltersInput, SignalsRange } from "@/lib/signals/contracts/shared";
import { normalizeSignalsRange } from "@/lib/signals/contracts/shared";
import { signalsFlow } from "@/lib/signals/policies/flow";
import { compatibilitySummaryFromSessions } from "@/lib/signals/policies/rollup";
import { readSignalsFilterOptions } from "@/lib/signals/readers/filter-options";
import { readSignalsSessionsWindow } from "@/lib/signals/readers/sessions";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";

/** @deprecated Prefer getSignalsOverview / getSignals* composers from @/lib/signals */
export type SignalsSummaryFilters = SignalsFiltersInput;

export { normalizeSignalsRange, signalsFlow };
export { readSignalsFilterOptions as getSignalsFilterOptions };

/** Compatibility wrapper for Activity UI and /api/signals/summary until IA cutover. */
export async function getSignalsSummary(orgId: string, filters: SignalsSummaryFilters = {}) {
  const windows = resolveSignalsWindows(filters);
  const [current, prior] = await Promise.all([
    readSignalsSessionsWindow(orgId, {
      from: windows.current.from,
      to: windows.current.to,
      ...windows.filters,
    }),
    readSignalsSessionsWindow(orgId, {
      from: windows.prior.from,
      to: windows.prior.to,
      ...windows.filters,
    }),
  ]);
  return compatibilitySummaryFromSessions(windows.range, current, prior);
}

export async function getPersonalSignalsLedger(orgId: string, authUserId: string) {
  const developer = await prisma.developer.findUnique({
    where: { orgId_authUserId: { orgId, authUserId } },
    select: { id: true },
  });
  if (!developer) return [];
  return prisma.signalsSession.findMany({
    where: { orgId, developerId: developer.id },
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { device: { select: { hostname: true } } },
  });
}

export type { SignalsRange };
