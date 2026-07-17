"use client";

import { DashboardMeterBar } from "@/components/dashboard/dashboard-meter-bar";
import type { PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import { cn } from "@/lib/utils";

function barColorForVerdict(code: PlanVerdictCode | null) {
  if (code === "LIMIT_EXCEEDED") return "var(--destructive)";
  if (code === "NEAR_LIMIT") return "var(--brand-yellow-dark)";
  if (code === "LIGHT_USE") return "color-mix(in srgb, var(--muted-foreground) 35%, transparent)";
  if (code == null) return "var(--muted)";
  return "var(--primary)";
}

export function CycleUtilizationBar({
  percent,
  displayPercent,
  verdictCode,
  label,
}: {
  percent: number | null;
  displayPercent: number | null;
  verdictCode: PlanVerdictCode | null;
  label: string;
}) {
  const meterValue =
    displayPercent != null ? Math.min(100, Math.max(2, displayPercent)) : 0;

  return (
    <div className="flex items-center gap-3">
      <DashboardMeterBar
        value={meterValue}
        color={barColorForVerdict(verdictCode)}
        className="min-w-0 flex-1"
        aria-label={
          displayPercent != null
            ? `${label} plan use ${displayPercent.toFixed(0)} percent`
            : `${label} plan use waiting for quota signal`
        }
        aria-valuenow={displayPercent != null ? Math.round(displayPercent) : undefined}
      />
      {percent != null ? (
        <p
          className={cn(
            "shrink-0 text-xs font-semibold tabular-nums",
            verdictCode === "LIMIT_EXCEEDED" && "text-destructive",
            verdictCode === "NEAR_LIMIT" && "text-brand-yellow-dark",
            verdictCode === "LIGHT_USE" && "text-muted-foreground",
            verdictCode === "HEALTHY" && "text-primary",
            verdictCode == null && "text-muted-foreground",
          )}
        >
          {percent.toFixed(0)}%
        </p>
      ) : (
        <p className="shrink-0 text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}
