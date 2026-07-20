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
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import { FlowPath, SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import type { OrgActivitySettings } from "@/lib/activity/contracts";
import { getOrgActivitySettings } from "@/lib/activity/service";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import {
  cycleViewPeriodLabel,
  parseCycleView,
  reportWindowForCycleView,
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import {
  DEFAULT_ROLLING_PERIOD,
  parseRollingPeriodFromSearch,
  type RollingPeriod,
} from "@/lib/dashboard/period-prefs";
import { getDeviceActivityFeed } from "@/lib/queries/activity/device-activity";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { formatCompactNumber } from "@/lib/format";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

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

type PeriodProps = {
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
  reportWindow: MetricWindow;
  periodLabel: string;
};

async function DeveloperActivityView({
  orgId,
  userId,
  role,
  reportWindow,
  periodLabel,
  settings,
}: {
  orgId: string;
  userId: string;
  role: "user";
  settings: OrgActivitySettings;
} & Pick<PeriodProps, "reportWindow" | "periodLabel">) {
  const personal = await getMeOverview(orgId, userId, role, { reportWindow });
  const [signalsLedger, deviceFeed] = await Promise.all([
    getPersonalSignalsLedger(orgId, userId),
    settings.teamDeviceActivityEnabled
      ? getDeviceActivityFeed(orgId, { developerId: personal.developer.id, limit: 50 })
      : Promise.resolve({ items: [], presenceFallback: false }),
  ]);
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

async function AdminActivityView({
  orgId,
  reportWindow,
  periodLabel,
}: { orgId: string } & Pick<PeriodProps, "reportWindow" | "periodLabel">) {
  const [usage, feed] = await Promise.all([
    getDashboardUsage(orgId, reportWindow),
    getDeviceActivityFeed(orgId, { limit: 50 }),
  ]);
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

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, role, userId } = await requireWorkspaceRole(rolesFor("self_view"));
  const isDeveloper = role === "user";
  const params = await searchParams;
  const settings = await getOrgActivitySettings(orgId);
  const allowDeveloperPeriodControls = !isDeveloper || settings.teamPeriodControlsEnabled;

  const cycleView = allowDeveloperPeriodControls ? parseCycleView(params.view) : "last_30_days";
  const rollingPeriod: RollingPeriod = allowDeveloperPeriodControls
    ? parseRollingPeriodFromSearch({
        days: params.days,
        from: params.from,
        to: params.to,
      })
    : DEFAULT_ROLLING_PERIOD;
  const now = new Date();
  const subscriptions = await listSubscriptions(orgId);
  const cyclePlans: Array<{
    billingCadence: string;
    billingCycleAnchorDate: Date | null;
    billingCycleDays?: number | null;
    createdAt?: Date | null;
  }> = subscriptions;

  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, cyclePlans, now);
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);

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

      {isDeveloper
        ? await DeveloperActivityView({
            orgId,
            userId,
            role: "user",
            settings,
            reportWindow,
            periodLabel,
          })
        : await AdminActivityView({
            orgId,
            reportWindow,
            periodLabel,
          })}
    </>
  );
}
