import type { ReactNode } from "react";
import { ActivityPageHeader } from "@/components/activity/activity-page-header";
import { DeviceActivityFeed } from "@/components/activity/device-activity-feed";
import { UsageBreakdownList } from "@/components/activity/usage-breakdown-list";
import { StatusBadge } from "@/components/app-shell";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
import { MetricPeriodFilter } from "@/components/dashboard/metric-period-filter";
import { FlowPath, SignalsKpi, SignalsSectionHeader } from "@/components/signals/signals-ui";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
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
import { getDashboardRequests } from "@/lib/queries/dashboard/requests";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { toolDisplayName } from "@/lib/tools/catalog";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function statusVariant(status: string): "success" | "warning" | "error" | "default" {
  return status === "success"
    ? "success"
    : status === "timeout" || status === "retry"
      ? "warning"
      : status === "failed" || status === "error"
        ? "error"
        : "default";
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
  if (!rows.length) return <div className="py-6 text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="pb-3 pr-4 pt-1 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-muted/30">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-5 pr-4 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
          stale={personal.sync.stale}
        />
      </div>

      <div className="mb-10 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Requests"
          hero
          className="pl-5"
          value={compact(personal.usage30d.requests)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Sessions"
          className="sm:border-l sm:border-border sm:pl-8"
          value={compact(personal.usage30d.sessions)}
        />
        <SignalsKpi
          label="Tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={compact(tokens)}
          sub="input + output"
        />
        <SignalsKpi
          label="Tools"
          className="sm:border-l sm:border-border sm:pl-8"
          value={compact(personal.toolsUsage30d.length)}
          sub="detected on your machines"
        />
      </div>

      <AiCodingPanel metrics={personal.aiCoding30d} models={personal.modelUsage30d} />

      <section className="mt-10 border bg-card p-5">
        <SignalsSectionHeader title="By tool." description="Tools detected on your machines." bordered={false} />
        <UsageBreakdownList
          valueMode="requests"
          countNoun="tools"
          empty="No tools detected yet."
          rows={personal.toolsUsage30d.map((tool) => {
            const metaParts = [tool.tokens > 0 ? `${compact(tool.tokens)} tokens` : null].filter(Boolean);
            return {
              key: tool.toolName,
              toolName: tool.toolName,
              requests: tool.requests,
              cost: tool.cost,
              metaExtra: metaParts.length ? metaParts.join(" · ") : null,
            };
          })}
        />
      </section>

      {settings.teamDeviceActivityEnabled ? <DeviceActivityFeed feed={deviceFeed} /> : null}

      <section className="mt-10 border bg-card p-5">
        <SignalsSectionHeader
          title="Your Signals ledger."
          description="App/domain flow metadata only. No prompts, screenshots, full URLs, or clipboard text. Latest sessions."
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
      </section>
    </>
  );
}

async function AdminActivityView({
  orgId,
  reportWindow,
  periodLabel,
}: { orgId: string } & Pick<PeriodProps, "reportWindow" | "periodLabel">) {
  const [usage, requests, feed] = await Promise.all([
    getDashboardUsage(orgId, reportWindow),
    getDashboardRequests(orgId, {
      limit: 50,
      from: reportWindow.from,
      to: reportWindow.to,
    }),
    getDeviceActivityFeed(orgId, { limit: 50 }),
  ]);
  const totalTokens = usage.kpis.inputTokens + usage.kpis.outputTokens;
  const totalRequests = usage.kpis.modelCalls;
  const models = [...usage.byModel].sort(
    (a, b) => b.requests - a.requests || b.tokens - a.tokens || (a.model ?? "").localeCompare(b.model ?? ""),
  );
  const tools = [...usage.byTool].sort((a, b) => b.requests - a.requests || b.tokens - a.tokens);
  const recent = requests.requests;

  return (
    <>
      <div className="mb-10 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Requests"
          hero
          className="pl-5"
          value={compact(totalRequests)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Sessions"
          className="sm:border-l sm:border-border sm:pl-8"
          value={compact(usage.kpis.sessions)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Tokens"
          className="xl:border-l xl:border-border xl:pl-8"
          value={compact(totalTokens)}
          sub="input + output"
        />
        <SignalsKpi
          label="Tools"
          className="sm:border-l sm:border-border sm:pl-8"
          value={compact(tools.length)}
          sub="with traffic this period"
        />
      </div>

      <section className="mt-10 border bg-card p-5">
        <SignalsSectionHeader
          title="Recent requests."
          description={`Gateway and observed request metadata for ${periodLabel}. Prompts are never stored.`}
          bordered={false}
        />
        {recent.length ? (
          <ul>
            {recent.map((request) => {
              const toolKey = request.toolName ?? "unknown";
              return (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-4 last:border-b-0 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ToolLogoTile tool={toolKey} size="sm" light className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {toolDisplayName(toolKey)}
                        <span className="font-normal text-muted-foreground"> · </span>
                        <span className="font-mono text-xs">{request.model ?? "Unknown"}</span>
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {request.user?.name ?? request.user?.email ?? "Unknown user"}
                        {request.device?.hostname ? ` · ${request.device.hostname}` : ""}
                        {request.totalTokens > 0 ? ` · ${compact(request.totalTokens)} tokens` : ""}
                        {request.latencyMs > 0 ? ` · ${request.latencyMs}ms` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge variant={statusVariant(request.status)}>{request.status}</StatusBadge>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            No gateway requests in this period. Device-observed tool usage still appears in the breakdowns
            below.
          </p>
        )}
      </section>

      <DeviceActivityFeed feed={feed} showDeveloper />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="border bg-card p-5">
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
              metaExtra: row.tokens > 0 ? `${compact(row.tokens)} tokens` : null,
            }))}
          />
        </section>

        <section className="border bg-card p-5">
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
              metaExtra: row.tokens > 0 ? `${compact(row.tokens)} tokens` : null,
            }))}
          />
        </section>
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
            ? `Personal request volume, device sync updates, and your Signals ledger for ${periodLabel}. Metadata only — prompts are never stored.`
            : `Request logs, device events, and tool activity for ${periodLabel}. Journey insights live under Signals.`
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
