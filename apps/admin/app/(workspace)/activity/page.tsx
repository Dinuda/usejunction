import type { ReactNode } from "react";
import { prisma } from "@usejunction/db";
import { ActivityPageHeader } from "@/components/activity/activity-page-header";
import { DeviceActivityFeed, ScrollableMetricList } from "@/components/activity/device-activity-feed";
import { StatusBadge } from "@/components/app-shell";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { LocalSyncPanel } from "@/components/dashboard/local-sync-panel";
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
import { getDashboardRequests } from "@/lib/queries/dashboard/requests";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";
import { getMeOverview } from "@/lib/queries/me/overview";
import { getPersonalSignalsLedger } from "@/lib/signals/read";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

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
  role: "developer";
  settings: OrgActivitySettings;
} & Pick<PeriodProps, "reportWindow" | "periodLabel">) {
  const personal = await getMeOverview(orgId, userId, role, { reportWindow });
  const [signalsLedger, deviceFeed] = await Promise.all([
    getPersonalSignalsLedger(orgId, userId),
    settings.teamDeviceActivityEnabled
      ? getDeviceActivityFeed(orgId, { developerId: personal.developer.id, limit: 50 })
      : Promise.resolve({ items: [] }),
  ]);
  const tokens = Number(BigInt(personal.usage30d.inputTokens) + BigInt(personal.usage30d.outputTokens));
  const spend = Number(BigInt(personal.usage30d.costMicros)) / 1_000_000;

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
          label="Usage cost"
          className="sm:border-l sm:border-border sm:pl-8"
          value={money(spend)}
          sub={`verified + estimated · ${periodLabel}`}
        />
      </div>

      <AiCodingPanel metrics={personal.aiCoding30d} models={personal.modelUsage30d} />

      <section className="mt-10 border bg-card p-5">
        <SignalsSectionHeader title="By tool." description="Tools detected on your machines." bordered={false} />
        {personal.toolsUsage30d.length ? (
          <ScrollableMetricList>
            <ul>
              {personal.toolsUsage30d.map((tool) => (
                <li
                  key={tool.toolName}
                  className="flex items-center justify-between gap-3 py-5 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{tool.toolName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tool.tokens > 0 ? `${compact(tool.tokens)} tokens` : "Detected"}
                      {tool.cost > 0 ? ` · ${money(tool.cost)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">{compact(tool.requests)}</p>
                </li>
              ))}
            </ul>
          </ScrollableMetricList>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">No tools detected yet.</p>
        )}
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

async function AdminUsageView({
  orgId,
  reportWindow,
  periodLabel,
}: { orgId: string } & Pick<PeriodProps, "reportWindow" | "periodLabel">) {
  const [usage, requests, feed] = await Promise.all([
    getDashboardUsage(orgId, reportWindow),
    getDashboardRequests(orgId, {
      limit: 20,
      from: reportWindow.from,
      to: reportWindow.to,
    }),
    getDeviceActivityFeed(orgId, { limit: 50 }),
  ]);
  const totalTokens = usage.kpis.inputTokens + usage.kpis.outputTokens;
  const totalRequests = usage.kpis.modelCalls;
  const models = usage.byModel;
  const tools = usage.byTool;
  const recent = requests.requests.slice(0, 8);

  return (
    <>
      <div className="mb-10 grid gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi
          label="Model calls"
          hero
          className="pl-5"
          value={compact(totalRequests)}
          sub={periodLabel}
        />
        <SignalsKpi
          label="Tokens"
          className="sm:border-l sm:border-border sm:pl-8"
          value={compact(totalTokens)}
          sub="input + output"
        />
        <SignalsKpi
          label="Verified usage"
          className="xl:border-l xl:border-border xl:pl-8"
          value={money(usage.kpis.verifiedUsageCost)}
          sub="vendor charges"
        />
        <SignalsKpi
          label="Estimated API value"
          className="sm:border-l sm:border-border sm:pl-8"
          value={money(usage.kpis.estimatedApiCost)}
          sub="rate-card estimate"
        />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="border bg-card p-5">
          <SignalsSectionHeader title="By tool." description="Detected and observed tools." bordered={false} />
          {tools.length ? (
            <ScrollableMetricList>
              <ul>
                {tools.map((row) => (
                  <li
                    key={row.toolName ?? "unknown"}
                    className="flex items-center justify-between gap-3 py-5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.toolName ?? "Unknown"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.requests.toLocaleString()} requests</p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{money(row.cost)}</p>
                  </li>
                ))}
              </ul>
            </ScrollableMetricList>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No tool traffic yet.</p>
          )}
        </section>

        <section className="border bg-card p-5">
          <SignalsSectionHeader
            title="By model."
            description={`Every recorded model · ${models.length} total.`}
            bordered={false}
          />
          {models.length ? (
            <ScrollableMetricList>
              <ul>
                {models.map((row) => (
                  <li
                    key={`${row.toolName}-${row.model}-${row.source}`}
                    className="flex items-center justify-between gap-3 py-5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">{row.model ?? "Unknown"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.requests.toLocaleString()} requests</p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{money(row.cost)}</p>
                  </li>
                ))}
              </ul>
            </ScrollableMetricList>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No model traffic yet.</p>
          )}
        </section>
      </div>

      <DeviceActivityFeed feed={feed} showDeveloper />

      <section className="mt-10 border bg-card p-5">
        <SignalsSectionHeader
          title="Recent requests."
          description={`Gateway metadata in ${periodLabel} — prompts are never stored.`}
          bordered={false}
        />
        {recent.length ? (
          <ul>
            {recent.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-3 py-5 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {request.toolName ?? "Unknown"} · {request.model ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(request.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <StatusBadge variant={statusVariant(request.status)}>{request.status}</StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            No gateway requests in this period. Local tool usage still appears above.
          </p>
        )}
      </section>
    </>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; days?: string; from?: string; to?: string }>;
}) {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  const isDeveloper = role === "developer";
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
  let cyclePlans: Array<{
    billingCadence: string;
    billingCycleAnchorDate: Date | null;
    billingCycleDays?: number | null;
    createdAt?: Date | null;
  }> = subscriptions;

  if (isDeveloper) {
    const developer = await prisma.developer.findFirst({
      where: { orgId, authUserId: userId },
      select: {
        planAssignments: {
          where: { active: true },
          select: {
            billingCadence: true,
            billingCycleAnchorDate: true,
            billingCycleDays: true,
            createdAt: true,
          },
        },
      },
    });
    if (developer?.planAssignments.length) {
      cyclePlans = developer.planAssignments;
    }
  }

  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, cyclePlans, now);
  const periodLabel = cycleViewPeriodLabel(cycleView, rollingPeriod);
  const periodProps: PeriodProps = { cycleView, rollingPeriod, reportWindow, periodLabel };

  return (
    <>
      <ActivityPageHeader
        title={isDeveloper ? "Your activity." : "Activity."}
        description={
          isDeveloper
            ? `Personal traffic for ${periodLabel}, device sync updates, and your Signals ledger. Metadata only — prompts are never stored.`
            : `Traffic from gateway and device-observed usage for ${periodLabel}. Journey insights live under Signals.`
        }
        showNav={!isDeveloper}
        actions={
          !isDeveloper ? (
            <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/activity" />
          ) : settings.teamPeriodControlsEnabled ? (
            <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/activity" />
          ) : undefined
        }
      />

      {isDeveloper
        ? await DeveloperActivityView({
            orgId,
            userId,
            role: "developer",
            settings,
            reportWindow: periodProps.reportWindow,
            periodLabel: periodProps.periodLabel,
          })
        : await AdminUsageView({
            orgId,
            reportWindow: periodProps.reportWindow,
            periodLabel: periodProps.periodLabel,
          })}
    </>
  );
}
