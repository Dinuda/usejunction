"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  input: { label: "In", color: "color-mix(in srgb, var(--foreground) 80%, transparent)" },
  output: { label: "Out", color: "color-mix(in srgb, var(--foreground) 50%, transparent)" },
  cacheRead: { label: "Cache read", color: "var(--brand-yellow-dark)" },
  cacheWrite: { label: "Cache write", color: "var(--border-strong)" },
} satisfies ChartConfig;

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function TokenBreakdownChart({
  input,
  output,
  cacheRead,
  cacheWrite,
}: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  const total = input + output + cacheRead + cacheWrite;
  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">No token breakdown yet.</p>;
  }

  const parts = [
    { key: "input" as const, label: "In", value: input },
    { key: "output" as const, label: "Out", value: output },
    { key: "cacheRead" as const, label: "Cache read", value: cacheRead },
    { key: "cacheWrite" as const, label: "Cache write", value: cacheWrite },
  ].filter((part) => part.value > 0);

  return (
    <div>
      <ChartContainer config={chartConfig} className="aspect-auto h-2 w-full">
        <BarChart
          data={[{ name: "tokens", input, output, cacheRead, cacheWrite }]}
          layout="vertical"
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" dataKey="name" hide width={0} />
          {parts.map((part) => (
            <Bar
              key={part.key}
              dataKey={part.key}
              stackId="tokens"
              fill={`var(--color-${part.key})`}
              radius={0}
              maxBarSize={8}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {parts.map((part) => (
          <div key={part.key}>
            <dt className="text-muted-foreground">{part.label}</dt>
            <dd className="font-medium tabular-nums">{compact(part.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
