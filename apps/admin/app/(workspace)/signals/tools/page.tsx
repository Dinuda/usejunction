import { SignalsFilters } from "@/components/signals/signals-filters";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import { changeLabel, durationLabel } from "@/components/signals/signals-ui";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getSignalsTools, normalizeSignalsRange, readSignalsFilterOptions } from "@/lib/signals";
import { requireWorkspaceRole } from "@/lib/workspace-context";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignalsToolsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const range = normalizeSignalsRange(firstParam(params.range));
  const teamId = firstParam(params.teamId) || undefined;

  const [envelope, options] = await Promise.all([
    getSignalsTools(
      { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
      { range, teamId },
    ),
    readSignalsFilterOptions(orgId),
  ]);
  const data = envelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Tool adoption"
        description="Which AI tools appear in journeys, and how usage is changing."
      />

      <SignalsFilters
        value={{ range, teamId }}
        teams={options.teams}
        showTool={false}
      />

      {data.tools.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Tool</th>
                <th className="py-2.5 pr-4 font-medium">Sessions</th>
                <th className="py-2.5 pr-4 font-medium">People</th>
                <th className="py-2.5 pr-4 font-medium">Share</th>
                <th className="py-2.5 pr-4 font-medium">Time</th>
                <th className="py-2.5 pr-4 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.tools.map((tool) => (
                <tr key={tool.tool} className="transition-colors hover:bg-muted/30">
                  <td className="py-3 pr-4 font-medium text-primary">{tool.tool}</td>
                  <td className="py-3 pr-4 tabular-nums">{tool.sessions}</td>
                  <td className="py-3 pr-4 tabular-nums">{tool.people}</td>
                  <td className="py-3 pr-4 tabular-nums">{tool.sharePercent}%</td>
                  <td className="py-3 pr-4 tabular-nums">{durationLabel(tool.durationSeconds)}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted-foreground">{changeLabel(tool.changePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">No tool adoption in this window.</p>
      )}
    </>
  );
}
