"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type DashboardMeterBarProps = {
  value: number;
  max?: number;
  color?: string;
  backgroundColor?: string;
  className?: string;
  "aria-label"?: string;
  "aria-valuenow"?: number;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
};

export function DashboardMeterBar({
  value,
  max = 100,
  color = "var(--primary)",
  backgroundColor = "var(--muted)",
  className,
  "aria-label": ariaLabel,
  "aria-valuenow": ariaValueNow,
  "aria-valuemin": ariaValueMin = 0,
  "aria-valuemax": ariaValueMax = 100,
}: DashboardMeterBarProps) {
  const clamped = Math.min(max, Math.max(0, value));
  const displayValue = max === 100 ? clamped : (clamped / max) * 100;
  const chartConfig = {
    value: { label: "Value", color },
    background: { label: "Background", color: backgroundColor },
  } satisfies ChartConfig;

  return (
    <div
      className={cn("w-full", className)}
      role="meter"
      aria-label={ariaLabel}
      aria-valuenow={ariaValueNow ?? Math.round(displayValue)}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-2 w-full">
        <BarChart
          data={[{ value: displayValue }]}
          layout="vertical"
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" hide width={0} />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={0}
            maxBarSize={8}
            background={{ fill: "var(--color-background)", radius: 0 }}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
