"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Point = { date: string; sessions: number; people: number; durationSeconds: number };

const chartConfig = {
  sessions: { label: "Sessions", color: "#08758a" },
} satisfies ChartConfig;

export function SignalsTrendChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <p className="py-8 text-sm text-muted-foreground">No daily trend yet.</p>;
  }
  const sparse = data.length < 5;
  return (
    <ChartContainer config={chartConfig} className="h-[220px] w-full">
      {sparse ? (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => String(value)} />} />
          <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[2, 2, 0, 0]} maxBarSize={48} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => String(value)} />} />
          <Area
            type="monotone"
            dataKey="sessions"
            stroke="var(--color-sessions)"
            fill="var(--color-sessions)"
            fillOpacity={0.12}
            strokeWidth={2}
            baseValue={0}
          />
        </AreaChart>
      )}
    </ChartContainer>
  );
}
