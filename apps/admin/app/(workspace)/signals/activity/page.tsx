import Link from "next/link";
import { Suspense } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { MemberWorkSessionList } from "@/components/developers/member-work-session-list";
import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { WorkCsvExportButton } from "@/components/signals/work-csv-export-button";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import {
  parseCycleView,
  reportWindowForCycleView,
} from "@/lib/dashboard/cycle-view";
import { parseRollingPeriodFromSearch } from "@/lib/dashboard/period-prefs";
import { getWorkActivity, readSignalsFilterOptions } from "@/lib/signals";
import { workSessionsToCsv } from "@/lib/signals/work-export";
import { listSubscriptions } from "@/lib/tools/subscriptions";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function SignalsActivityPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(rolesFor("org_overview"));
  const cycleView = parseCycleView(firstParam(params.view));
  const rollingPeriod = parseRollingPeriodFromSearch({
    days: firstParam(params.days),
    from: firstParam(params.from),
    to: firstParam(params.to),
  });
  const developerId = firstParam(params.developerId) || undefined;
  const teamId = firstParam(params.teamId) || undefined;
  const tool = firstParam(params.tool) || undefined;
  const now = new Date();

  const [subscriptions, options] = await Promise.all([
    listSubscriptions(orgId),
    readSignalsFilterOptions(orgId),
  ]);
  const reportWindow = reportWindowForCycleView(cycleView, rollingPeriod, subscriptions, now);

  const filters = {
    from: isoDate(reportWindow.from),
    to: isoDate(reportWindow.to),
    developerId,
    teamId,
    tool,
    limit: 100,
  };
  const context = { orgId, actorId: userId, roles: [role], now, timezone: UTC_TIMEZONE };

  const workEnvelope = await getWorkActivity(context, filters);
  const work = workEnvelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Activity"
        description="Coding-tool work from enrolled agents. Asks, change summaries, and file activity — not full chat transcripts."
      >
        <div className="flex justify-end">
          <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/signals/activity" />
        </div>
      </SignalsPageHeader>

      <Suspense fallback={null}>
        <SignalsFilters
          value={{ teamId, tool, developerId }}
          teams={options.teams}
          tools={options.tools}
          developers={options.developers}
          showPerson
        />
      </Suspense>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Work</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Structured traces from local AI tools when work extraction is on.
            </p>
          </div>
          {work.enabled && work.sessions.length ? (
            <WorkCsvExportButton
              filename={`work-activity-${new Date().toISOString().slice(0, 10)}.csv`}
              csv={workSessionsToCsv(work.sessions)}
            />
          ) : null}
        </div>

        {!work.enabled ? (
          <p className="py-2 text-sm text-muted-foreground">
            Work extraction is off. Turn it on under{" "}
            <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
              Settings → Signals
            </Link>
            .
          </p>
        ) : work.sessions.length ? (
          <MemberWorkSessionList
            sessions={work.sessions}
            density="table"
            fromTeam={false}
            showPerson
            maxHeightClass="max-h-[40rem]"
          />
        ) : (
          <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
            <EmptyDescription>No extracted work sessions in this period yet.</EmptyDescription>
          </Empty>
        )}
      </section>
    </>
  );
}
