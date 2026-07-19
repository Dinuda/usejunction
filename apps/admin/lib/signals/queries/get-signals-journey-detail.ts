import {
  assertInsightRoles,
  makeInsightEnvelope,
  type InsightContext,
  type InsightEnvelope,
} from "@/lib/insights/contracts/envelope";
import type {
  SignalsJourneyDetailInput,
  SignalsJourneyDetailV1,
  SignalsJourneyStep,
} from "@/lib/signals/contracts/journey-detail.v1";
import { changePercent, median } from "@/lib/signals/policies/aggregates";
import { displayFlow, parseFlowKey } from "@/lib/signals/policies/flow";
import { readSignalsSessionSteps } from "@/lib/signals/readers/sessions";
import { resolveSignalsWindows } from "@/lib/signals/queries/windows";
import { rolesFor } from "@/lib/rbac";

type StepLike = {
  app?: string | null;
  domain?: string | null;
  startedAt?: string;
  endedAt?: string;
};

function stepLabel(step: StepLike) {
  return step.domain ?? step.app ?? "unknown";
}

function stepSeconds(step: StepLike) {
  if (!step.startedAt || !step.endedAt) return 0;
  const start = Date.parse(step.startedAt);
  const end = Date.parse(step.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

function aggregateSteps(sessions: Array<{ steps: unknown; durationSeconds: number }>): {
  steps: SignalsJourneyStep[];
  medianDurationSeconds: number;
} {
  const durations = sessions.map((session) => session.durationSeconds);
  const byIndex = new Map<number, { labels: Map<string, number>; seconds: number[] }>();

  for (const session of sessions) {
    const steps = Array.isArray(session.steps) ? (session.steps as StepLike[]) : [];
    steps.forEach((step, index) => {
      const bucket =
        byIndex.get(index) ??
        ({
          labels: new Map<string, number>(),
          seconds: [],
        } satisfies { labels: Map<string, number>; seconds: number[] });
      const label = stepLabel(step);
      bucket.labels.set(label, (bucket.labels.get(label) ?? 0) + 1);
      bucket.seconds.push(stepSeconds(step));
      byIndex.set(index, bucket);
    });
  }

  const steps: SignalsJourneyStep[] = Array.from(byIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => {
      let label = "unknown";
      let best = -1;
      for (const [candidate, count] of bucket.labels) {
        if (count > best) {
          best = count;
          label = candidate;
        }
      }
      return {
        label,
        medianSeconds: median(bucket.seconds.filter((value) => value > 0)),
      };
    });

  return {
    steps,
    medianDurationSeconds: median(durations),
  };
}

export async function getSignalsJourneyDetail(
  context: InsightContext,
  input: SignalsJourneyDetailInput,
): Promise<InsightEnvelope<SignalsJourneyDetailV1>> {
  assertInsightRoles(context, rolesFor("org_overview"));
  const parts = parseFlowKey(input.flowKey);
  if (!parts) {
    throw new Error("INVALID_FLOW_KEY");
  }

  const windows = resolveSignalsWindows(input, context.now);
  const [currentSessions, priorSessions] = await Promise.all([
    readSignalsSessionSteps(context.orgId, input.flowKey, {
      from: windows.current.from,
      to: windows.current.to,
      ...windows.filters,
    }),
    readSignalsSessionSteps(context.orgId, input.flowKey, {
      from: windows.prior.from,
      to: windows.prior.to,
      ...windows.filters,
    }),
  ]);

  const { steps, medianDurationSeconds } = aggregateSteps(currentSessions);
  const people = new Set(currentSessions.map((session) => session.developerId));

  return makeInsightEnvelope({
    context,
    kind: "signals-journey-detail",
    window: windows.current,
    dataThrough: currentSessions[0]?.startedAt ?? null,
    data: {
      windowDays: windows.windowDays,
      flowKey: input.flowKey,
      flow: displayFlow(parts),
      people: people.size,
      sessions: currentSessions.length,
      medianDurationSeconds,
      changePercent: changePercent(currentSessions.length, priorSessions.length),
      steps,
    },
  });
}
