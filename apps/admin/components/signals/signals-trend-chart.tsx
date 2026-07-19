"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useIsMobile } from "@/hooks/use-mobile";

type Point = { date: string; sessions: number; people: number; durationSeconds: number };

const chartConfig = {
  sessions: { label: "Sessions", color: "#08758a" },
} satisfies ChartConfig;

export function SignalsTrendChart({ data }: { data: Point[] }) {
  const isMobile = useIsMobile();
  if (!data.length) {
    return (
      <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
        <EmptyDescription>No daily trend yet.</EmptyDescription>
      </Empty>
    );
  }
  const sparse = data.length < 5;
  return (
    <ChartContainer config={chartConfig} className="h-[200px] w-full sm:h-[220px]">
      {sparse ? (
        <BarChart data={data} margin={{ left: 0, right: isMobile ? 0 : 8, top: 12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={isMobile ? 42 : 24}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis tickLine={false} axisLine={false} width={isMobile ? 28 : 34} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => String(value)} />} />
          <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[2, 2, 0, 0]} maxBarSize={48} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ left: 0, right: isMobile ? 0 : 8, top: 12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={isMobile ? 42 : 24}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis tickLine={false} axisLine={false} width={isMobile ? 28 : 34} allowDecimals={false} />
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
