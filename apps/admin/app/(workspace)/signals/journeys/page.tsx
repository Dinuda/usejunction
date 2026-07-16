import Link from "next/link";
import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { changeLabel, durationLabel, FlowPath } from "@/components/signals/signals-ui";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getSignalsJourneys, normalizeSignalsRange, readSignalsFilterOptions } from "@/lib/signals";
import { requireWorkspaceRole } from "@/lib/workspace-context";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignalsJourneysPage({
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
    getSignalsJourneys(
      { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
      { range, developerId, teamId, tool },
    ),
    readSignalsFilterOptions(orgId),
  ]);
  const data = envelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Journeys"
        description="Aggregated before → AI → after patterns. No prompts or page content."
      />

      <SignalsFilters
        value={{ range, teamId, tool, developerId }}
        teams={options.teams}
        tools={options.tools}
      />

      {data.journeys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Journey</th>
                <th className="py-2.5 pr-4 font-medium">People</th>
                <th className="py-2.5 pr-4 font-medium">Sessions</th>
                <th className="py-2.5 pr-4 font-medium">Median</th>
                <th className="py-2.5 pr-4 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.journeys.map((journey) => (
                <tr key={journey.flowKey} className="transition-colors hover:bg-muted/30">
                  <td className="py-3 pr-4">
                    <Link href={`/signals/journeys/${encodeURIComponent(journey.flowKey)}`} className="hover:underline">
                      <FlowPath flow={journey.flow} />
                    </Link>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{journey.people}</td>
                  <td className="py-3 pr-4 tabular-nums">{journey.sessions}</td>
                  <td className="py-3 pr-4 tabular-nums">{durationLabel(journey.medianDurationSeconds)}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted-foreground">{changeLabel(journey.changePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No journeys match these filters.</p>
      )}
    </>
  );
}
