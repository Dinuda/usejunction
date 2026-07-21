"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import type { DailyReportSeriesPoint } from "@/lib/reports/daily-report";
import { useIsMobile } from "@/hooks/use-mobile";

const chartConfig = {
  cost: { label: "Spend", color: "var(--primary)" },
  requests: { label: "Requests", color: "var(--primary)" },
  tokens: { label: "Tokens", color: "var(--primary)" },
} satisfies ChartConfig;

export function DailyUsageAreaChart({
  data,
  metric = "cost",
}: {
  data: DailyReportSeriesPoint[];
  metric?: "cost" | "requests" | "tokens";
}) {
  const isMobile = useIsMobile();
  const tickFormatter =
    metric === "cost"
      ? (value: number) => formatUsd(value)
      : (value: number) => formatCompactNumber(value);

  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full sm:h-[260px]">
      <AreaChart data={data} margin={{ left: 0, right: isMobile ? 0 : 8, top: 12, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={isMobile ? 42 : 28}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={isMobile ? 36 : 44}
          tickFormatter={tickFormatter}
          allowDecimals={metric === "cost"}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey={metric}
          name={metric}
          type="monotone"
          fill={`var(--color-${metric})`}
          fillOpacity={0.12}
          stroke={`var(--color-${metric})`}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
