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
  size = "default",
  expectedPercent = null,
  showPercent = true,
}: {
  percent: number | null;
  displayPercent: number | null;
  verdictCode: PlanVerdictCode | null;
  label: string;
  size?: "default" | "lg";
  /** Linear expected % used so far in the quota window (pace marker). */
  expectedPercent?: number | null;
  /** When false, only the meter renders (percent shown elsewhere). */
  showPercent?: boolean;
}) {
  const meterValue =
    displayPercent != null ? Math.min(100, Math.max(2, displayPercent)) : 0;
  const mark =
    expectedPercent == null ? null : Math.min(100, Math.max(0, expectedPercent));

  return (
    <div className="flex items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <DashboardMeterBar
          value={meterValue}
          color={barColorForVerdict(verdictCode)}
          className="w-full"
          aria-label={
            displayPercent != null
              ? `${label} plan use ${displayPercent.toFixed(0)} percent`
              : `${label} plan use waiting for quota signal`
          }
          aria-valuenow={displayPercent != null ? Math.round(displayPercent) : undefined}
        />
        {mark != null ? (
          <span
            aria-hidden
            title={`Expected ~${Math.round(mark)}% at this point in the cycle`}
            className="pointer-events-none absolute top-[-2px] h-[calc(100%+4px)] w-px bg-foreground/45"
            style={{ left: `${mark}%` }}
          />
        ) : null}
      </div>
      {showPercent ? (
        percent != null ? (
          <p
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              size === "lg" ? "text-lg" : "text-xs",
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
        )
      ) : null}
    </div>
  );
}
