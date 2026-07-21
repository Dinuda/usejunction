import type { PlanVerdict } from "@/lib/quotas/plan-utilization-policy";
import { verdictHint, verdictLabel } from "@/lib/quotas/plan-utilization-policy";

export type AttentionItem = {
  id: string;
  severity: "warning" | "error";
  title: string;
  detail: string;
  href: string;
};

type HealthIssue = {
  severity: "warning" | "error";
  message: string;
  context: string;
};

/**
 * Build overview attention from structured signals only — no utilization re-calc.
 */
export function buildAttentionItems(input: {
  healthIssues: HealthIssue[];
  planVerdicts: Array<{ id: string; name: string; verdict: PlanVerdict }>;
  limit?: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const [index, issue] of input.healthIssues.slice(0, 4).entries()) {
    items.push({
      id: `health-${index}`,
      severity: issue.severity,
      title: issue.message,
      detail: issue.context,
      href: "/tools",
    });
  }

  for (const row of input.planVerdicts) {
    if (row.verdict.code !== "NEAR_LIMIT" && row.verdict.code !== "LIMIT_EXCEEDED") continue;
    items.push({
      id: `plan-${row.id}`,
      severity: row.verdict.severity === "critical" ? "error" : "warning",
      title: `${row.name} · ${verdictLabel(row.verdict.code)}`,
      detail: verdictHint(row.verdict.code) ?? "",
      href: "/team",
    });
  }

  return items.slice(0, input.limit ?? 5);
}
