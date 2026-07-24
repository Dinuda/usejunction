import type { DailyReportPlanTool, DailyReportToolRow } from "@/lib/reports/daily-report";
import { canonicalToolKey } from "@/lib/tools/catalog";

/**
 * Attach the same cycle plan % / status / exhaustion projection the dashboard
 * shows onto today's tool rows.
 * Do not invent a "daily plan %" from includedCycleMicros — that produced absurd
 * figures (e.g. 2811%) for quota-based plans like Cursor.
 */
export function attachCyclePlanPercentToTools(input: {
  tools: DailyReportToolRow[];
  planTools: DailyReportPlanTool[];
}): DailyReportToolRow[] {
  if (input.tools.length === 0) return input.tools;
  const byTool = new Map(
    input.planTools.map((tool) => [canonicalToolKey(tool.toolName) || tool.toolName, tool]),
  );

  return input.tools.map((tool) => {
    const plan = byTool.get(canonicalToolKey(tool.toolName) || tool.toolName);
    return {
      ...tool,
      planUsedPercent: plan?.usedPercent ?? null,
      planStatusLabel: plan?.statusLabel ?? null,
      planExhaustDateLabel: plan?.exhaustDateLabel ?? null,
    };
  });
}

/** True when the tool is already near/over the plan. */
export function isPlanPressureStatus(statusLabel: string | null | undefined): boolean {
  if (!statusLabel) return false;
  const s = statusLabel.toLowerCase();
  return s.includes("near limit") || s.includes("over quota");
}

/**
 * Plan-status line for a tool: status + projected exhaustion on every tool that has a date.
 */
export function formatPlanToolRunway(tool: {
  statusLabel?: string | null;
  exhaustDateLabel?: string | null;
  planStatusLabel?: string | null;
  planExhaustDateLabel?: string | null;
}): string {
  const status = tool.statusLabel ?? tool.planStatusLabel ?? null;
  const exhaust = tool.exhaustDateLabel ?? tool.planExhaustDateLabel ?? null;
  const parts: string[] = [];
  if (status) parts.push(status);
  if (exhaust) parts.push(`Runs out ${exhaust}`);
  return parts.join(" · ");
}
