import type { SignalsJourneyRow, SignalsToolRow, SignalsTrendPoint } from "@/lib/signals/contracts/shared";
import { changePercent, median, sharePercent, startOfUtcWeek } from "@/lib/signals/policies/aggregates";
import { displayFlow, flowKeyFromSession, flowPartsFromSession, signalsFlow } from "@/lib/signals/policies/flow";
import type { SignalsSessionRow } from "@/lib/signals/readers/sessions";

type FlowBucket = {
  flowKey: string;
  flow: string;
  sessions: number;
  people: Set<string>;
  durations: number[];
  lastSeenAt: Date;
};

type ToolBucket = {
  tool: string;
  sessions: number;
  people: Set<string>;
  durationSeconds: number;
};

export function aggregateJourneys(sessions: SignalsSessionRow[]): FlowBucket[] {
  const flows = new Map<string, FlowBucket>();
  for (const session of sessions) {
    const parts = flowPartsFromSession(session);
    const flowKey = flowKeyFromSession(session);
    const flow = displayFlow(parts);
    const row =
      flows.get(flowKey) ??
      ({
        flowKey,
        flow,
        sessions: 0,
        people: new Set<string>(),
        durations: [],
        lastSeenAt: session.startedAt,
      } satisfies FlowBucket);
    row.sessions += 1;
    row.people.add(session.developerId);
    row.durations.push(session.durationSeconds);
    if (session.startedAt > row.lastSeenAt) row.lastSeenAt = session.startedAt;
    flows.set(flowKey, row);
  }
  return Array.from(flows.values());
}

export function aggregateTools(sessions: SignalsSessionRow[]): ToolBucket[] {
  const tools = new Map<string, ToolBucket>();
  for (const session of sessions) {
    const row =
      tools.get(session.aiTool) ??
      ({
        tool: session.aiTool,
        sessions: 0,
        people: new Set<string>(),
        durationSeconds: 0,
      } satisfies ToolBucket);
    row.sessions += 1;
    row.people.add(session.developerId);
    row.durationSeconds += session.durationSeconds;
    tools.set(session.aiTool, row);
  }
  return Array.from(tools.values());
}

export function toJourneyRows(
  current: FlowBucket[],
  prior: FlowBucket[],
): SignalsJourneyRow[] {
  const priorByKey = new Map(prior.map((row) => [row.flowKey, row]));
  return current
    .map((row) => {
      const previous = priorByKey.get(row.flowKey);
      return {
        flowKey: row.flowKey,
        flow: row.flow,
        people: row.people.size,
        sessions: row.sessions,
        medianDurationSeconds: median(row.durations),
        averageDurationSeconds: Math.round(
          row.durations.reduce((sum, value) => sum + value, 0) / Math.max(row.sessions, 1),
        ),
        changePercent: changePercent(row.sessions, previous?.sessions ?? 0),
        lastSeenAt: row.lastSeenAt.toISOString(),
      };
    })
    .sort((a, b) => b.sessions - a.sessions || b.people - a.people);
}

export function toToolRows(current: ToolBucket[], prior: ToolBucket[]): SignalsToolRow[] {
  const priorByTool = new Map(prior.map((row) => [row.tool, row]));
  const totalSessions = current.reduce((sum, row) => sum + row.sessions, 0);
  return current
    .map((row) => {
      const previous = priorByTool.get(row.tool);
      return {
        tool: row.tool,
        sessions: row.sessions,
        people: row.people.size,
        durationSeconds: row.durationSeconds,
        sharePercent: sharePercent(row.sessions, totalSessions),
        changePercent: changePercent(row.sessions, previous?.sessions ?? 0),
      };
    })
    .sort((a, b) => b.sessions - a.sessions || b.people - a.people);
}

export function buildWeeklyTrend(
  sessions: SignalsSessionRow[],
  window?: { from: Date; to: Date },
): SignalsTrendPoint[] {
  const weeks = new Map<string, { sessions: number; people: Set<string>; durationSeconds: number }>();
  for (const session of sessions) {
    const weekStart = startOfUtcWeek(session.startedAt);
    const row =
      weeks.get(weekStart) ??
      ({
        sessions: 0,
        people: new Set<string>(),
        durationSeconds: 0,
      } satisfies { sessions: number; people: Set<string>; durationSeconds: number });
    row.sessions += 1;
    row.people.add(session.developerId);
    row.durationSeconds += session.durationSeconds;
    weeks.set(weekStart, row);
  }

  const weekKeys = weeksForWindow(window);
  for (const key of weekKeys) {
    if (!weeks.has(key)) {
      weeks.set(key, { sessions: 0, people: new Set<string>(), durationSeconds: 0 });
    }
  }

  return Array.from(weeks.entries())
    .filter(([weekStart]) => weekKeys.length === 0 || weekKeys.includes(weekStart))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, row]) => ({
      weekStart,
      sessions: row.sessions,
      people: row.people.size,
      durationSeconds: row.durationSeconds,
    }));
}

function weeksForWindow(window?: { from: Date; to: Date }): string[] {
  if (!window) return [];
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), window.from.getUTCDate()));
  const end = new Date(Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()));
  // Align the first cursor to the Monday of its week.
  const firstWeek = startOfUtcWeek(cursor);
  cursor.setUTCFullYear(Number(firstWeek.slice(0, 4)), Number(firstWeek.slice(5, 7)) - 1, Number(firstWeek.slice(8, 10)));
  let guard = 0;
  while (cursor <= end && guard < 200) {
    keys.push(startOfUtcWeek(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    guard += 1;
  }
  return keys;
}

export function summarizeWindow(sessions: SignalsSessionRow[]) {
  const people = new Set(sessions.map((session) => session.developerId));
  const durationSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  return {
    sessions: sessions.length,
    activePeople: people.size,
    durationSeconds,
    averageDurationSeconds: sessions.length ? Math.round(durationSeconds / sessions.length) : 0,
  };
}

export function compatibilitySummaryFromSessions(
  range: 7 | 30 | 90,
  sessions: SignalsSessionRow[],
  priorSessions: SignalsSessionRow[],
) {
  const journeys = toJourneyRows(aggregateJourneys(sessions), aggregateJourneys(priorSessions));
  const tools = toToolRows(aggregateTools(sessions), aggregateTools(priorSessions));
  const summary = summarizeWindow(sessions);
  return {
    range,
    sessions: summary.sessions,
    activeDevelopers: summary.activePeople,
    durationSeconds: summary.durationSeconds,
    averageDurationSeconds: summary.averageDurationSeconds,
    topFlows: journeys.slice(0, 10).map((row) => ({
      flow: row.flow,
      sessions: row.sessions,
      people: row.people,
      averageDurationSeconds: row.averageDurationSeconds,
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : new Date(0),
    })),
    byTool: tools.slice(0, 10).map((row) => ({
      tool: row.tool,
      sessions: row.sessions,
      people: row.people,
      durationSeconds: row.durationSeconds,
    })),
    recentSessions: sessions.slice(0, 25).map((session) => ({
      id: session.id,
      person: session.developer.name,
      email: session.developer.email,
      flow: signalsFlow(session),
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt,
    })),
  };
}
