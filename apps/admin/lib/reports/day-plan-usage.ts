import { resolveBillingCycle } from "@/lib/billing/cycles";
import { readAssignments } from "@/lib/insights/readers/assignments";
import { canonicalToolKey } from "@/lib/tools/catalog";
import type { DailyReportToolRow } from "@/lib/reports/daily-report";

type AssignmentRow = Awaited<ReturnType<typeof readAssignments>>[number];

export function dayPlanUsedPercentFromAssignment(input: {
  costMicros: number;
  assignment: Pick<
    AssignmentRow,
    "includedCycleMicros" | "billingCadence" | "billingCycleAnchorDate" | "billingCycleDays"
  >;
  now: Date;
}): number | null {
  const included = input.assignment.includedCycleMicros;
  if (included <= BigInt(0)) return null;
  const cycle = resolveBillingCycle(
    {
      billingCadence: input.assignment.billingCadence,
      billingCycleAnchorDate: input.assignment.billingCycleAnchorDate,
      billingCycleDays: input.assignment.billingCycleDays,
    },
    input.now,
  );
  const dailyAllowanceMicros = Number(included) / cycle.totalDays;
  if (!Number.isFinite(dailyAllowanceMicros) || dailyAllowanceMicros <= 0) return null;
  return (input.costMicros / dailyAllowanceMicros) * 100;
}

export async function enrichTopToolsWithDayPlanPercent(input: {
  orgId: string;
  developerId?: string | null;
  tools: DailyReportToolRow[];
  now: Date;
}): Promise<DailyReportToolRow[]> {
  if (input.tools.length === 0) return input.tools;
  const assignments = await readAssignments(input.orgId, {
    developerId: input.developerId ?? undefined,
  });
  const byTool = new Map<string, AssignmentRow>();
  for (const assignment of assignments) {
    const key = canonicalToolKey(assignment.toolName);
    if (!byTool.has(key)) byTool.set(key, assignment);
  }

  return input.tools.map((tool) => {
    const assignment = byTool.get(tool.toolName);
    const dayPlanUsedPercent = assignment
      ? dayPlanUsedPercentFromAssignment({
          costMicros: Math.round(tool.cost * 1_000_000),
          assignment,
          now: input.now,
        })
      : null;
    return { ...tool, dayPlanUsedPercent };
  });
}
