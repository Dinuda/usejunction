"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/** Map raw agent tool names to what managers care about. */
const ACTION_LABELS: Record<string, string> = {
  exec_command: "Run shell commands",
  exec: "Run shell",
  apply_patch: "Edit files",
  write_stdin: "Send terminal input",
  request_user_input: "Ask the user",
  wait: "Wait on processes",
  update_plan: "Update the plan",
  view_image: "View images",
  read_file: "Read files",
  list_dir: "List directories",
  grep: "Search code",
  search: "Search",
  web_search: "Search the web",
};

export function agentActionLabel(name: string): string {
  if (ACTION_LABELS[name]) return ACTION_LABELS[name];
  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const chartConfig = {
  calls: { label: "Calls", color: "var(--primary)" },
} satisfies ChartConfig;

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function ToolUsageChart({
  tools,
}: {
  tools: Array<{ name: string; calls: number }>;
}) {
  if (!tools.length) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No usage mix yet — it appears after agents run on connected machines.
      </p>
    );
  }

  const total = tools.reduce((sum, tool) => sum + tool.calls, 0);
  const rows = tools.slice(0, 8).map((tool) => ({
    name: tool.name,
    label: agentActionLabel(tool.name),
    calls: tool.calls,
    share: total > 0 ? Math.round((tool.calls / total) * 100) : 0,
  }));
  const chartHeight = Math.max(160, rows.length * 36);

  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full"
        style={{ height: chartHeight }}
        initialDimension={{ width: 480, height: chartHeight }}
      >
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 48, left: 0, bottom: 4 }}
          accessibilityLayer
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={148}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const share = payload?.[0]?.payload?.share;
                  return typeof share === "number" ? `${share}% of actions` : "Actions";
                }}
              />
            }
          />
          <Bar
            dataKey="calls"
            fill="var(--color-calls)"
            radius={0}
            maxBarSize={14}
            background={{ fill: "var(--muted)", radius: 0 }}
          />
        </BarChart>
      </ChartContainer>
      <p className="mt-3 text-xs text-muted-foreground">
        {compact(total)} agent actions in this window · top {rows.length} by call volume
      </p>
    </div>
  );
}
