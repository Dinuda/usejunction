import Link from "next/link";
import { ToolBrandLabel, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import type { WorkActivitySession } from "@/lib/signals/queries/get-work-activity";
import { displayWorkTitle, workSessionPath } from "@/lib/signals/work-display";
import {
  formatTraceDuration,
  formatTraceLocation,
  formatTraceSkills,
  formatTraceStats,
} from "@/lib/signals/work-trace";
import { cn } from "@/lib/utils";

function formatWhen(iso: string, relative = false) {
  const date = new Date(iso);
  if (!relative) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
    <li className="border-b border-border/50 last:border-b-0">
      <Link
        href={href}
        className="flex items-start gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-black/[0.03] focus-visible:bg-black/[0.03]"
      >
        <ToolLogoTile tool={session.toolName} size="sm" light className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayWorkTitle(session.title, session.tldr)}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {[location, duration, stats, formatWhen(session.observedAt, true)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>
    </li>
  );
}

function TableRow({
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
    <tr className="align-top transition-colors hover:bg-black/[0.03]">
      {showPerson ? (
        <td className="px-4 py-5 pr-4">
          <div className="font-medium">{session.person}</div>
          <div className="text-xs text-muted-foreground">{session.email}</div>
        </td>
      ) : null}
      <td className="px-4 py-5 pr-4">
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
      </td>
      <td className="py-5 pr-4 text-sm text-muted-foreground">
        {location ? <span className="font-medium text-foreground">{location}</span> : "—"}
      </td>
      <td className="py-5 pr-4">
        <ToolBrandLabel tool={session.toolName} subtitle={modeSubtitle(session)} light />
      </td>
      <td className="py-5 pr-4 text-sm tabular-nums text-muted-foreground">{duration ?? "—"}</td>
      <td className="py-5 pr-4 text-sm text-muted-foreground">{formatWhen(session.observedAt, true)}</td>
    </tr>
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
    return <p className="py-2 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  if (density === "teaser") {
    return (
      <div
        className={cn(
          "overflow-y-auto overscroll-contain border border-border/50 bg-white",
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
    <div
      className={cn(
        "overflow-auto overscroll-contain border border-border/50 bg-white",
        maxHeightClass,
      )}
    >
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border/60 bg-white text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            {showPerson ? <th className="px-4 pb-3 pr-4 pt-3 font-medium">Person</th> : null}
            <th className="px-4 pb-3 pr-4 pt-3 font-medium">Work</th>
            <th className="pb-3 pr-4 pt-3 font-medium">Where</th>
            <th className="pb-3 pr-4 pt-3 font-medium">Tool</th>
            <th className="pb-3 pr-4 pt-3 font-medium">Duration</th>
            <th className="pb-3 pr-4 pt-3 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <TableRow
              key={session.id}
              session={session}
              fromTeam={fromTeam}
              showPerson={showPerson}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
