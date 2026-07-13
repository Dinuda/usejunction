"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Point = { date: string; requests: number; cost: number; previousRequests: number; previousCost: number };

const chartConfig = {
  requests: { label: "Requests", color: "#08758a" },
  previousRequests: { label: "Previous period", color: "#8a8c85" },
} satisfies ChartConfig;

export function OverviewChart({ data }: { data: Point[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 12, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(value) => value.slice(5)} />
        <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `Date · ${value}`} />} />
        <Area type="monotone" dataKey="previousRequests" stroke="var(--color-previousRequests)" fill="transparent" strokeDasharray="5 5" strokeWidth={1.5} />
        <Area type="monotone" dataKey="requests" stroke="var(--color-requests)" fill="var(--color-requests)" fillOpacity={0.12} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
