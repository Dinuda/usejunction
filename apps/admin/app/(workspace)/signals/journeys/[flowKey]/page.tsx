import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalsPageHeader } from "@/components/signals/signals-page-header";
import {
  changeLabel,
  durationLabel,
  FlowPath,
  SignalsKpi,
  SignalsSectionHeader,
} from "@/components/signals/signals-ui";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getSignalsJourneyDetail, normalizeSignalsRange, parseFlowKey } from "@/lib/signals";
import { requireWorkspaceRole } from "@/lib/workspace-context";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignalsJourneyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ flowKey: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { flowKey: rawKey } = await params;
  const flowKey = decodeURIComponent(rawKey);
  if (!parseFlowKey(flowKey)) notFound();

  const query = (await searchParams) ?? {};
  const { orgId, userId, role } = await requireWorkspaceRole(["owner", "admin"]);
  const range = normalizeSignalsRange(firstParam(query.range));

  let envelope;
  try {
    envelope = await getSignalsJourneyDetail(
      { orgId, actorId: userId, roles: [role], now: new Date(), timezone: UTC_TIMEZONE },
      {
        flowKey,
        range,
        developerId: firstParam(query.developerId) || undefined,
        teamId: firstParam(query.teamId) || undefined,
        tool: firstParam(query.tool) || undefined,
      },
    );
  } catch {
    notFound();
  }

  const data = envelope.data;

  return (
    <>
      <SignalsPageHeader
        title="Journey detail"
        eyebrow={
          <Link href="/signals/journeys" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            ← All journeys
          </Link>
        }
      >
        <FlowPath flow={data.flow} />
      </SignalsPageHeader>

      <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <SignalsKpi label="Sessions" value={data.sessions.toLocaleString()} accent />
        <SignalsKpi label="People" value={data.people.toLocaleString()} />
        <SignalsKpi label="Median duration" value={durationLabel(data.medianDurationSeconds)} />
        <SignalsKpi label="Change" value={changeLabel(data.changePercent)} />
      </div>

      <section className="mt-10">
        <SignalsSectionHeader
          title="Aggregated timeline."
          description="Median time in each hop across matching sessions. Metadata only."
        />
        {data.steps.length ? (
          <ol>
            {data.steps.map((step, index) => (
              <li key={`${step.label}-${index}`} className="flex items-center gap-3 py-5">
                <span className="w-6 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-medium">{step.label}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{durationLabel(step.medianSeconds)}</span>
                {index < data.steps.length - 1 ? (
                  <span className="sr-only">then</span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            {data.sessions
              ? "Sessions found, but step timing is incomplete for this journey."
              : "No sessions for this journey in the selected window."}
          </p>
        )}
        {data.steps.length ? (
          <p className="mt-6 font-mono text-sm text-muted-foreground">
            {data.steps.map((step) => `${step.label} ${durationLabel(step.medianSeconds)}`).join(" → ")}
          </p>
        ) : null}
      </section>
    </>
  );
}
