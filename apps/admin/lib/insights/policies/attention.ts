import type { PlanVerdict } from "@/lib/quotas/plan-utilization-policy";
import { verdictLabel } from "@/lib/quotas/plan-utilization-policy";
import { formatUserDeviceContext } from "@/lib/queries/dashboard/config-health";

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

type OfflineDevice = {
  id: string;
  hostname: string;
  lastSeenAt: Date;
  user: { name: string } | null;
};

/**
 * Build overview attention from structured signals only — no utilization re-calc.
 */
export function buildAttentionItems(input: {
  offlineDevices: OfflineDevice[];
  healthIssues: HealthIssue[];
  planVerdicts: Array<{ id: string; name: string; verdict: PlanVerdict }>;
  limit?: number;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const device of input.offlineDevices) {
    items.push({
      id: `device-${device.id}`,
      severity: "warning",
      title: `${formatUserDeviceContext(device.user, device)} is offline`,
      detail: `Last seen ${device.lastSeenAt.toLocaleString()}`,
      href: "/team",
    });
  }

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
      detail: row.verdict.reasons.join(", "),
      href: "/team",
    });
  }

  return items.slice(0, input.limit ?? 5);
}
