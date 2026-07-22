"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolBrandIcon } from "@/components/tools/tool-brand-icon";
import { DailyUsageAreaChart } from "@/components/reports/daily/daily-usage-area-chart";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import type { DailyReportPayload } from "@/lib/reports/daily-report";
import { cn } from "@/lib/utils";

function Delta({ value, priorLabel }: { value: number | null; priorLabel: string }) {
  if (value === null) return null;
  return (
    <span className={cn("text-xs font-medium tabular-nums", value >= 0 ? "text-success" : "text-destructive")}>
      {value >= 0 ? "+" : ""}
      {value.toFixed(0)}% vs {priorLabel}
    </span>
  );
}

function chartMetric(report: DailyReportPayload): "tokens" | "cost" | "requests" {
  if (report.series.some((p) => p.tokens > 0)) return "tokens";
  if (report.series.some((p) => p.cost > 0)) return "cost";
  return "requests";
}

export function DailyReportView({
  report,
  audienceSwitcher,
}: {
  report: DailyReportPayload;
  audienceSwitcher?: ReactNode;
}) {
  const isWeek = report.period === "week";
  const priorLabel = isWeek ? "prior week" : "prior day";
  const metric = chartMetric(report);
  const fourthLabel = report.kind === "org" ? "Active members" : "Tools";
  const fourthValue =
    report.kind === "org"
      ? formatCompactNumber(report.membersActive ?? 0)
      : formatCompactNumber(report.kpis.tools);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={report.title} description={report.subtitle} className="mb-2">
        {audienceSwitcher}
      </PageHeader>

      <div className="grid grid-cols-2 items-stretch gap-y-5 sm:gap-y-8 xl:grid-cols-4">
        <SignalsKpi
          label="Period spend"
          value={formatUsd(report.kpis.cost)}
          sub={<Delta value={report.kpis.costDeltaPct} priorLabel={priorLabel} />}
          accent
          hero
          compactMobile
        />
        <SignalsKpi
          label="Requests"
          value={formatCompactNumber(report.kpis.requests)}
          sub={<Delta value={report.kpis.requestsDeltaPct} priorLabel={priorLabel} />}
          compactMobile
          className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
        />
        <SignalsKpi
          label="Tokens"
          value={formatCompactNumber(report.kpis.tokens)}
          compactMobile
          className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
        />
        <SignalsKpi
          label={fourthLabel}
          value={fourthValue}
          compactMobile
          className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
        />
      </div>

      <Panel as="section" className="mt-10 sm:p-6">
        <SignalsSectionHeader
          title="Usage."
          description={
            metric === "tokens"
              ? isWeek
                ? "Tokens across the week."
                : "Tokens through the day."
              : metric === "cost"
                ? isWeek
                  ? "Spend across the week."
                  : "Spend through the day."
                : isWeek
                  ? "Requests across the week."
                  : "Requests through the day."
          }
        />
        <DailyUsageAreaChart data={report.series} metric={metric} />
      </Panel>

      <Panel as="section" className="mt-10 sm:p-6">
        <SignalsSectionHeader
          title="Tools."
          description={
            report.topTools[0]
              ? `${report.topTools[0].displayName} led with ${formatCompactNumber(report.topTools[0].tokens)} tokens · ${formatUsd(report.topTools[0].cost)}.`
              : isWeek
                ? "No usage recorded for this week yet."
                : "No usage recorded for this local day yet."
          }
        />
        {report.topTools.length > 0 ? (
          <ul>
            {report.topTools.map((tool) => (
              <li key={tool.toolName} className="flex items-start justify-between gap-3 py-5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="flex h-5 w-3.5 shrink-0 items-center justify-center">
                    <ToolBrandIcon tool={tool.toolName} size={14} className="text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5">{tool.displayName}</p>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">
                      {formatCompactNumber(tool.requests)} requests · {formatCompactNumber(tool.tokens)} tokens ·{" "}
                      {tool.tokenSharePercent.toFixed(0)}% of tokens
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{formatUsd(tool.cost)}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
