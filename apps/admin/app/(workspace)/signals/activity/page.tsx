"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AudienceScopeSwitcher } from "@/components/audience-scope-switcher";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { CycleViewPicker } from "@/components/dashboard/cycle-view-picker";
import { MemberWorkSessionList } from "@/components/developers/member-work-session-list";
import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { WorkCsvExportButton } from "@/components/signals/work-csv-export-button";
import type { AudienceScope } from "@/lib/audience-scope";
import {
  type CycleView,
} from "@/lib/dashboard/cycle-view";
import type { RollingPeriod } from "@/lib/dashboard/period-prefs";
import type { getWorkActivity, readSignalsFilterOptions } from "@/lib/signals";
import { workSessionsToCsv } from "@/lib/signals/work-export";
import { useAppQuery } from "@/lib/api/client";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";

type SignalsActivityPayload = {
  scope: AudienceScope;
  canSwitchAudience: boolean;
  youUnlinked?: boolean;
  cycleView: CycleView;
  rollingPeriod: RollingPeriod;
  developerId?: string;
  teamId?: string;
  tool?: string;
  options: Awaited<ReturnType<typeof readSignalsFilterOptions>>;
  work: Awaited<ReturnType<typeof getWorkActivity>>["data"];
};

export default function SignalsActivityPage() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const query = useAppQuery<SignalsActivityPayload>(["app", "signals", "activity", queryString], `/api/app/signals/activity${queryString ? `?${queryString}` : ""}`);
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const { scope, cycleView, rollingPeriod, developerId, teamId, tool, options, work, youUnlinked } = query.data;
  const isYou = scope === "you";

  return (
    <>
      <SignalsPageHeader
        title="Activity"
        description={
          isYou
            ? "Your coding-tool work from enrolled agents. Asks, change summaries, and file activity — not full chat transcripts."
            : "Coding-tool work from enrolled agents. Asks, change summaries, and file activity — not full chat transcripts."
        }
      >
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
          <CycleViewPicker view={cycleView} period={rollingPeriod} basePath="/signals/activity" />
          <AudienceScopeSwitcher className="sm:w-auto" />
        </div>
      </SignalsPageHeader>

      {youUnlinked ? (
        <Empty className="min-h-0 gap-1 border border-border p-6 md:p-8">
          <EmptyDescription>Link a developer profile to see your Signals work.</EmptyDescription>
        </Empty>
      ) : (
        <>
          <SignalsFilters
            value={{ teamId, tool, developerId: isYou ? undefined : developerId }}
            teams={options.teams}
            tools={options.tools}
            developers={options.developers}
            showTeam={!isYou}
            showPerson={!isYou}
          />

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
                showPerson={!isYou}
                maxHeightClass="max-h-[40rem]"
              />
            ) : (
              <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
                <EmptyDescription>No extracted work sessions in this period yet.</EmptyDescription>
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
