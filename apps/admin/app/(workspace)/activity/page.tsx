"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { MobileDataCard, MobileDataField, MobileDataList } from "@/components/ui/mobile-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReactNode } from "react";
import { ActivityPageHeader } from "@/components/activity/activity-page-header";
import { Panel } from "@/components/panel";
import { DeviceActivityFeed } from "@/components/activity/device-activity-feed";
import { UsageBreakdownList } from "@/components/activity/usage-breakdown-list";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import { FlowPath, SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import {
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import {
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import type { getDeviceActivityFeed } from "@/lib/queries/activity/device-activity";
import type { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import type { getMeOverview } from "@/lib/queries/me/overview";
import { formatCompactNumber } from "@/lib/format";
import type { getPersonalSignalsLedger } from "@/lib/signals/read";
import type { OrgActivitySettings } from "@/lib/activity/contracts";
import { useAppQuery } from "@/lib/api/client";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

const AiCodingPanel = dynamic(() => import("@/components/dashboard/ai-coding-panel").then((mod) => mod.AiCodingPanel), { ssr: false });

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: ReactNode;
}) {
  if (!rows.length) {
    return (
      <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
        <EmptyDescription>{empty}</EmptyDescription>
      </Empty>
    );
  }
  return (
    <>
      <MobileDataList>
        {rows.map((row, index) => (
          <MobileDataCard key={index}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {row.map((cell, cellIndex) => (
                <MobileDataField
                  key={cellIndex}
                  label={headers[cellIndex] ?? `Field ${cellIndex + 1}`}
                  value={cell}
                  className={cellIndex === 0 ? "col-span-2" : undefined}
                />
              ))}
            </dl>
          </MobileDataCard>
        ))}
      </MobileDataList>
      <Table containerClassName="hidden md:block" className="min-w-[720px] text-left text-sm">
        <TableHeader className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} className="pb-3 pr-4 pt-1 font-medium">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index} className="transition-colors hover:bg-muted/30">
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="py-5 pr-4 align-middle">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

function DeveloperActivityView({
  periodLabel,
  settings,
  personal,
  signalsLedger,
  deviceFeed,
}: {
  settings: OrgActivitySettings;
  periodLabel: string;
  personal: Awaited<ReturnType<typeof getMeOverview>>;
  signalsLedger: Awaited<ReturnType<typeof getPersonalSignalsLedger>>;
  deviceFeed: Awaited<ReturnType<typeof getDeviceActivityFeed>>;
}) {
  const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));

  return (
    <>
      <div className="mb-10">
        <LocalSyncPanel
          lastSeenAt={personal.sync.lastSeenAt}
          lastUsageSyncAt={personal.sync.lastUsageSyncAt}
          lastAccountSyncAt={personal.sync.lastAccountSyncAt}
        />
      </div>

      <div className="mb-10 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Requests"
          hero
          className="pl-5"
          value={formatCompactNumber(personal.usage30d.requests)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Sessions"
          className="sm:border-l sm:border-border sm:pl-8"
          value={formatCompactNumber(personal.usage30d.sessions)}
        />
        <SignalsKpi
          label="Tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={formatCompactNumber(tokens)}
          sub="input + output"
        />
        <SignalsKpi
          label="Tools"
          className="sm:border-l sm:border-border sm:pl-8"
          value={formatCompactNumber(personal.toolsUsage30d.length)}
          sub="detected on your device"
        />
      </div>

      <AiCodingPanel metrics={personal.aiCoding30d} models={personal.modelUsage30d} />

      <Panel as="section" className="mt-10">
        <SignalsSectionHeader title="By tool." description="Tools detected on your device." bordered={false} />
        <UsageBreakdownList
          valueMode="requests"
          countNoun="tools"
          empty="No tools detected yet."
          rows={personal.toolsUsage30d.map((tool) => {
            const metaParts = [tool.tokens > 0 ? `${formatCompactNumber(tool.tokens)} tokens` : null].filter(Boolean);
            return {
              key: tool.toolName,
              toolName: tool.toolName,
              requests: tool.requests,
              cost: tool.cost,
              metaExtra: metaParts.length ? metaParts.join(" · ") : null,
            };
          })}
        />
      </Panel>

      {settings.teamDeviceActivityEnabled ? <DeviceActivityFeed feed={deviceFeed} /> : null}

      <Panel as="section" className="mt-10">
        <SignalsSectionHeader
          title="Your Signals ledger."
          description="App and domain flow for latest sessions. No screenshots, full URLs, or clipboard text."
          bordered={false}
        />
        <DataTable
          headers={["Flow", "Time", "Duration", "Device", "Confidence"]}
          empty="No Signals sessions uploaded yet."
          rows={signalsLedger.map((session) => [
            <FlowPath
              flow={[
                session.domainBefore ?? session.appBefore ?? "unknown",
                session.aiTool,
                session.domainAfter ?? session.appAfter ?? "unknown",
              ].join(" -> ")}
            />,
            <span className="text-muted-foreground">{new Date(session.startedAt).toLocaleString()}</span>,
            <span className="tabular-nums">{duration(session.durationSeconds)}</span>,
            <span>{session.device.hostname}</span>,
            <span className="tabular-nums text-muted-foreground">{Math.round(session.confidence * 100)}%</span>,
          ])}
        />
      </Panel>
    </>
  );
}

function AdminActivityView({
  periodLabel,
  usage,
  feed,
}: {
  periodLabel: string;
  usage: Awaited<ReturnType<typeof getDashboardUsage>>;
  feed: Awaited<ReturnType<typeof getDeviceActivityFeed>>;
}) {
  const totalTokens = usage.kpis.inputTokens + usage.kpis.outputTokens;
  const totalRequests = usage.kpis.modelCalls;
  const models = [...usage.byModel].sort(
    (a, b) => b.requests - a.requests || b.tokens - a.tokens || (a.model ?? "").localeCompare(b.model ?? ""),
  );
  const tools = [...usage.byTool].sort((a, b) => b.requests - a.requests || b.tokens - a.tokens);

  return (
    <>
      <div className="mb-10 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Requests"
          hero
          className="pl-5"
          value={formatCompactNumber(totalRequests)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Sessions"
          className="sm:border-l sm:border-border sm:pl-8"
          value={formatCompactNumber(usage.kpis.sessions)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={formatCompactNumber(totalTokens)}
          sub="input + output"
        />
        <SignalsKpi
          label="Tools"
          className="sm:border-l sm:border-border sm:pl-8"
          value={formatCompactNumber(tools.length)}
          sub="with traffic this period"
        />
      </div>

      <DeviceActivityFeed feed={feed} showDeveloper />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel as="section">
          <SignalsSectionHeader
            title="By tool."
            description="Request volume by detected tool."
            bordered={false}
          />
          <UsageBreakdownList
            valueMode="requests"
            countNoun="tools"
            empty="No tool traffic yet."
            rows={tools.map((row) => ({
              key: row.toolName ?? "unknown",
              toolName: row.toolName,
              requests: row.requests,
              cost: row.cost,
              metaExtra: row.tokens > 0 ? `${formatCompactNumber(row.tokens)} tokens` : null,
            }))}
          />
        </Panel>

        <Panel as="section">
          <SignalsSectionHeader
            title="By model."
            description={`Request volume by model · ${models.length} total.`}
            bordered={false}
          />
          <UsageBreakdownList
            valueMode="requests"
            countNoun="models"
            empty="No model traffic yet."
            rows={models.map((row) => ({
              key: `${row.toolName}-${row.model}-${row.source}`,
              toolName: row.toolName,
              model: row.model,
              requests: row.requests,
              cost: row.cost,
              metaExtra: row.tokens > 0 ? `${formatCompactNumber(row.tokens)} tokens` : null,
            }))}
          />
        </Panel>
      </div>
    </>
  );
}

type ActivityPayload =
  | { kind: "personal"; settings: OrgActivitySettings; allowPeriodControls: boolean; cycleView: CycleView; rollingPeriod: RollingPeriod; periodLabel: string; personal: Awaited<ReturnType<typeof getMeOverview>>; signalsLedger: Awaited<ReturnType<typeof getPersonalSignalsLedger>>; deviceFeed: Awaited<ReturnType<typeof getDeviceActivityFeed>> }
  | { kind: "organization"; allowPeriodControls: boolean; cycleView: CycleView; rollingPeriod: RollingPeriod; periodLabel: string; usage: Awaited<ReturnType<typeof getDashboardUsage>>; deviceFeed: Awaited<ReturnType<typeof getDeviceActivityFeed>> };

export default function ActivityPage() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const query = useAppQuery<ActivityPayload>(["app", "activity", queryString], `/api/app/activity${queryString ? `?${queryString}` : ""}`);
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const payload = query.data;
  const isDeveloper = payload.kind === "personal";
  const { allowPeriodControls: allowDeveloperPeriodControls, cycleView, rollingPeriod, periodLabel } = payload;

  return (
    <>
      <ActivityPageHeader
        title={isDeveloper ? "Your activity." : "Activity."}
        description={
          isDeveloper
            ? `Personal request volume, device sync updates, and your Signals ledger for ${periodLabel}. Work detail can be turned off.`
            : `Device events and tool activity for ${periodLabel}. Journey insights live under Signals.`
        }
        actions={
          allowDeveloperPeriodControls ? (
            <MetricPeriodFilter
              view={cycleView}
              period={rollingPeriod}
              basePath="/activity"
              label={periodLabel}
            />
          ) : undefined
        }
      />

      {payload.kind === "personal"
        ? <DeveloperActivityView settings={payload.settings} periodLabel={periodLabel} personal={payload.personal} signalsLedger={payload.signalsLedger} deviceFeed={payload.deviceFeed} />
        : <AdminActivityView periodLabel={periodLabel} usage={payload.usage} feed={payload.deviceFeed} />}
    </>
  );
}
