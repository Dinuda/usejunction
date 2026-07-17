import Link from "next/link";
import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { durationLabel, FlowPath } from "@/components/signals/signals-ui";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getSignalsActivity, normalizeSignalsRange, readSignalsFilterOptions } from "@/lib/signals";
import { requireWorkspaceRole } from "@/lib/workspace-context";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function SignalsActivityPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const range = normalizeSignalsRange(firstParam(params.range));
  const developerId = firstParam(params.developerId) || undefined;
  const teamId = firstParam(params.teamId) || undefined;
  const tool = firstParam(params.tool) || undefined;

  const [envelope, options] = await Promise.all([
    getSignalsActivity(
      { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
      { range, developerId, teamId, tool, limit: 50 },
    ),
    readSignalsFilterOptions(orgId),
  ]);
  const data = envelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Activity"
        description="Privacy-safe session metadata. No prompts, screenshots, full URLs, or clipboard text."
      />

      <SignalsFilters
        value={{ range, teamId, tool, developerId }}
        teams={options.teams}
        tools={options.tools}
        developers={options.developers}
        showPerson
      />

      {data.sessions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border/70 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4 pt-1 font-medium">Person</th>
                <th className="pb-3 pr-4 pt-1 font-medium">Flow</th>
                <th className="pb-3 pr-4 pt-1 font-medium">Duration</th>
                <th className="pb-3 pr-4 pt-1 font-medium">When</th>
                <th className="pb-3 pr-4 pt-1 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((session) => (
                <tr key={session.id} className="transition-colors hover:bg-muted/30">
                  <td className="py-5 pr-4">
                    <div className="font-medium">{session.person}</div>
                    <div className="text-xs text-muted-foreground">{session.email}</div>
                  </td>
                  <td className="py-5 pr-4">
                    <Link
                      href={`/signals/journeys/${encodeURIComponent(session.flowKey)}`}
                      className="hover:underline"
                    >
                      <FlowPath flow={session.flow} />
                    </Link>
                  </td>
                  <td className="py-5 pr-4 tabular-nums">{durationLabel(session.durationSeconds)}</td>
                  <td className="py-5 pr-4 text-muted-foreground">{formatWhen(session.startedAt)}</td>
                  <td className="py-5 pr-4 tabular-nums text-muted-foreground">
                    {Math.round(session.confidence * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No sessions match these filters.</p>
      )}
    </>
  );
}
