"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { WowWeekStrip } from "@/components/reports/daily/wow-week-strip";
import { DailyUsageAreaChart } from "@/components/reports/daily/daily-usage-area-chart";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import type { DailyReportPayload } from "@/lib/reports/daily-report";
import { formatPlanToolRunway, isPlanPressureStatus } from "@/lib/reports/day-plan-usage";
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
  if (report.wowStrip) return report.wowStrip.metricDefault;
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
  const priorLabel = isWeek ? "prior week" : "yesterday";
  const metric = chartMetric(report);
  const spendLabel = isWeek ? "Period spend" : "Today's spend";
  const fourthLabel = report.kind === "org" ? "Active members" : "Plan usage";
  const fourthValue =
    report.kind === "org"
      ? formatCompactNumber(report.membersActive ?? 0)
      : report.plan?.usedPercent != null
        ? `${report.plan.usedPercent.toFixed(0)}%`
        : "—";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={report.title} description={report.subtitle} className="mb-2">
        {audienceSwitcher}
      </PageHeader>

      <div className="grid grid-cols-2 items-stretch gap-y-5 sm:gap-y-8 xl:grid-cols-4">
        <SignalsKpi
          label={spendLabel}
          value={formatUsd(report.kpis.cost)}
          sub={<Delta value={report.kpis.costDeltaPct} priorLabel={priorLabel} />}
          accent
          hero
          compactMobile
        />
        <SignalsKpi
          label="Tokens"
          value={formatCompactNumber(report.kpis.tokens)}
          sub={<Delta value={report.kpis.tokensDeltaPct} priorLabel={priorLabel} />}
          compactMobile
          className="border-l-2 border-border-strong pl-3 pr-2 sm:pl-4 sm:pr-3"
        />
        <SignalsKpi
          label="Requests"
          value={formatCompactNumber(report.kpis.requests)}
          sub={<Delta value={report.kpis.requestsDeltaPct} priorLabel={priorLabel} />}
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
          title="This week"
          description={
            report.wowStrip
              ? "Daily token volume this week."
              : metric === "tokens"
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
        {report.wowStrip ? (
          <WowWeekStrip strip={report.wowStrip} metric={metric} className="mt-2" />
        ) : (
          <DailyUsageAreaChart data={report.series} metric={metric} />
        )}
      </Panel>

      {report.plan ? (
        <Panel as="section" className="mt-10 sm:p-6">
          <SignalsSectionHeader
            title="Plan status"
            action={
              <div className="flex items-baseline gap-3 text-sm">
                <span
                  className={cn(
                    "font-semibold",
                    report.plan.withinAllowance ? "text-foreground" : "text-[color:#c0682c]",
                  )}
                >
                  {report.plan.statusLabel}
                </span>
                {report.plan.withinAllowance !== false &&
                report.plan.tools.some((t) => t.exhaustDateLabel) ? (
                  <span className="font-medium tabular-nums text-muted-foreground">
                    Runs out{" "}
                    {report.plan.tools.find((t) => t.exhaustDateLabel)?.exhaustDateLabel}
                  </span>
                ) : report.plan.usedPercent != null ? (
                  <span className="font-medium tabular-nums text-muted-foreground">
                    {report.plan.usedPercent.toFixed(0)}% this cycle
                  </span>
                ) : null}
              </div>
            }
          />
          {report.plan.hint ? (
            <p className="-mt-3 mb-5 text-xs text-muted-foreground">{report.plan.hint}</p>
          ) : null}
          {report.plan.tools.length > 0 ? (
            <ul>
              {report.plan.tools.map((tool) => {
                const warn = isPlanPressureStatus(tool.statusLabel);
                return (
                  <li
                    key={tool.toolName}
                    className="flex items-center justify-between gap-3 py-5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ToolLogoTile tool={tool.toolName} size="sm" light />
                      <p
                        className={cn(
                          "truncate text-sm font-medium leading-5",
                          warn && "text-[color:#c0682c]",
                        )}
                      >
                        {tool.displayName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-3 text-sm">
                      <span
                        className={cn(
                          "font-medium",
                          warn ? "text-[color:#c0682c]" : "text-muted-foreground",
                        )}
                      >
                        {formatPlanToolRunway(tool)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {tool.usedPercent != null ? `${tool.usedPercent.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      <Panel as="section" className="mt-16 sm:p-6">
        <SignalsSectionHeader
          title={isWeek ? "Usage by tool" : "Usage by tool today"}
          action={
            report.topTools[0] ? (
              <div className="flex items-baseline gap-3 text-sm">
                <span className="font-semibold text-foreground">{report.topTools[0].displayName}</span>
                <span className="font-medium tabular-nums text-muted-foreground">
                  {formatCompactNumber(report.topTools[0].tokens)} tok · {formatUsd(report.topTools[0].cost)}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                {isWeek ? "No usage this week" : "No usage today"}
              </span>
            )
          }
        />
        {report.topTools.length > 0 ? (
          <ul>
            {report.topTools.map((tool) => (
              <li
                key={tool.toolName}
                className="flex items-center justify-between gap-3 py-5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <ToolLogoTile tool={tool.toolName} size="sm" light />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5">{tool.displayName}</p>
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">
                      {tool.tokens <= 0 && tool.requests > 0
                        ? `${formatCompactNumber(tool.requests)} requests · tokens not reported`
                        : `${formatCompactNumber(tool.requests)} requests · ${formatCompactNumber(tool.tokens)} tokens today`}
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
