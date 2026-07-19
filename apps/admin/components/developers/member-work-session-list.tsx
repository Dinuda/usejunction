import Link from "next/link";
import { ToolBrandLabel, ToolLogoTile } from "@/components/tools/tool-brand-icon";
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
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import { formatRelativeTime } from "@/lib/format";
import { displayWorkTitle, workSessionPath } from "@/lib/signals/work-display";
import {
  formatTraceDuration,
  formatTraceLocation,
  formatTraceSkills,
  formatTraceStats,
} from "@/lib/signals/work-trace";
import { cn } from "@/lib/utils";

function rowMeta(session: WorkActivitySession) {
  const location = formatTraceLocation(session.trace);
  const duration = formatTraceDuration(session.trace);
  const skills = formatTraceSkills(session.trace, 3);
  const stats = formatTraceStats(session.trace);
  const fileCount = session.trace?.files?.length ?? 0;
  return { location, duration, skills, stats, fileCount };
}

function modeSubtitle(session: WorkActivitySession) {
  return [session.model, session.mode].filter(Boolean).join(" · ") || null;
}

function TeaserRow({
  session,
  fromTeam,
}: {
  session: WorkActivitySession;
  fromTeam: boolean;
}) {
  const { location, duration, stats } = rowMeta(session);
  const href = `${workSessionPath(session.id)}${fromTeam ? "?from=team" : ""}`;

  return (
    <li className="min-w-0 border-b border-border/50 last:border-b-0">
      <Link
        href={href}
        className="flex w-full min-w-0 max-w-full items-start gap-3 overflow-hidden px-4 py-3.5 outline-none transition-colors hover:bg-black/[0.03] focus-visible:bg-black/[0.03]"
      >
        <ToolLogoTile tool={session.toolName} size="sm" light className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="min-w-0 max-w-full truncate text-sm font-medium">
            {displayWorkTitle(session.title, session.tldr)}
          </p>
          <p className="mt-1 min-w-0 max-w-full truncate text-xs text-muted-foreground">
            {[location, duration, stats, formatRelativeTime(session.observedAt)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>
    </li>
  );
}

function WorkSessionRow({
  session,
  fromTeam,
  showPerson,
}: {
  session: WorkActivitySession;
  fromTeam: boolean;
  showPerson: boolean;
}) {
  const { location, duration, skills, stats, fileCount } = rowMeta(session);
  const href = `${workSessionPath(session.id)}${fromTeam ? "?from=team" : ""}`;
  const tldr =
    session.tldr && session.title && session.tldr !== session.title
      ? displayWorkTitle(session.tldr, null)
      : null;

  return (
    <TableRow className="align-top transition-colors hover:bg-black/[0.03]">
      {showPerson ? (
        <TableCell className="px-4 py-5 pr-4">
          <div className="font-medium">{session.person}</div>
          <div className="text-xs text-muted-foreground">{session.email}</div>
        </TableCell>
      ) : null}
      <TableCell className="px-4 py-5 pr-4">
        <Link
          href={href}
          className="group block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-start gap-2.5">
            <ToolLogoTile tool={session.toolName} size="sm" light className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium group-hover:underline underline-offset-2">
                {displayWorkTitle(session.title, session.tldr)}
              </div>
              {tldr ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{tldr}</p>
              ) : null}
              {(skills || fileCount > 0 || stats) && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {[skills ? `Skills · ${skills}` : null, fileCount ? `${fileCount} files` : null, stats]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
        </Link>
      </TableCell>
      <TableCell className="py-5 pr-4 text-sm text-muted-foreground">
        {location ? <span className="font-medium text-foreground">{location}</span> : "—"}
      </TableCell>
      <TableCell className="py-5 pr-4">
        <ToolBrandLabel tool={session.toolName} subtitle={modeSubtitle(session)} light />
      </TableCell>
      <TableCell className="py-5 pr-4 text-sm tabular-nums text-muted-foreground">{duration ?? "—"}</TableCell>
      <TableCell className="py-5 pr-4 text-sm text-muted-foreground">{formatRelativeTime(session.observedAt)}</TableCell>
    </TableRow>
  );
}

function MobileWorkSessionCard({
  session,
  fromTeam,
  showPerson,
}: {
  session: WorkActivitySession;
  fromTeam: boolean;
  showPerson: boolean;
}) {
  const { location, duration, stats } = rowMeta(session);
  const href = `${workSessionPath(session.id)}${fromTeam ? "?from=team" : ""}`;

  return (
    <MobileDataCard>
      <Link href={href} className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {showPerson ? (
          <p className="mb-3 truncate text-xs text-muted-foreground">
            {session.person} · {session.email}
          </p>
        ) : null}
        <div className="flex min-w-0 items-start gap-3">
          <ToolLogoTile tool={session.toolName} size="sm" light className="shrink-0" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium">{displayWorkTitle(session.title, session.tldr)}</p>
            {stats ? <p className="mt-1 text-xs text-muted-foreground">{stats}</p> : null}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <MobileDataField label="Where" value={location ?? "—"} />
          <MobileDataField label="Tool" value={modeSubtitle(session) ?? session.toolName} />
          <MobileDataField label="Duration" value={duration ?? "—"} />
          <MobileDataField label="When" value={formatRelativeTime(session.observedAt)} />
        </dl>
      </Link>
    </MobileDataCard>
  );
}

export function MemberWorkSessionList({
  sessions,
  emptyMessage = "No extracted work sessions yet.",
  maxHeightClass = "max-h-[36rem]",
  density = "table",
  fromTeam = true,
  showPerson = false,
}: {
  sessions: WorkActivitySession[];
  emptyMessage?: string;
  maxHeightClass?: string;
  density?: "table" | "teaser";
  fromTeam?: boolean;
  showPerson?: boolean;
}) {
  if (!sessions.length) {
    return (
      <Empty className="min-h-0 gap-1 border-0 p-6 md:p-6">
        <EmptyDescription>{emptyMessage}</EmptyDescription>
      </Empty>
    );
  }

  if (density === "teaser") {
    return (
      <div
        className={cn(
          "w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain border border-border/50 bg-white",
          maxHeightClass,
        )}
      >
        <ul>
          {sessions.map((session) => (
            <TeaserRow key={session.id} session={session} fromTeam={fromTeam} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <MobileDataList>
        {sessions.map((session) => (
          <MobileWorkSessionCard
            key={session.id}
            session={session}
            fromTeam={fromTeam}
            showPerson={showPerson}
          />
        ))}
      </MobileDataList>
      <div
        className={cn(
          "hidden overflow-auto overscroll-contain border border-border/50 bg-white md:block",
          maxHeightClass,
        )}
      >
      <Table className="min-w-[760px] text-left text-sm">
        <TableHeader className="sticky top-0 z-10 border-b border-border/60 bg-white text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <TableRow>
            {showPerson ? <TableHead className="px-4 pb-3 pr-4 pt-3 font-medium">Person</TableHead> : null}
            <TableHead className="px-4 pb-3 pr-4 pt-3 font-medium">Work</TableHead>
            <TableHead className="pb-3 pr-4 pt-3 font-medium">Where</TableHead>
            <TableHead className="pb-3 pr-4 pt-3 font-medium">Tool</TableHead>
            <TableHead className="pb-3 pr-4 pt-3 font-medium">Duration</TableHead>
            <TableHead className="pb-3 pr-4 pt-3 font-medium">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <WorkSessionRow
              key={session.id}
              session={session}
              fromTeam={fromTeam}
              showPerson={showPerson}
            />
          ))}
        </TableBody>
      </Table>
      </div>
    </>
  );
}
